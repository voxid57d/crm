create function private.finance_command(t uuid,k uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.financial_audit_events;
begin
 if auth.uid() is null or k is null or not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Financial command denied';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':finance:'||k::text,0));
 perform 1 from public.tenants where id=t for update;
 select * into a from public.financial_audit_events where tenant_id=t and request_key=k;
 if found then
  if a.actor_id<>auth.uid() or a.request_payload<>payload then raise exception 'Financial request identifier already used for different details';end if;
  return a.id;
 end if;return null;
end $$;
create function private.finance_time(value text) returns timestamptz language plpgsql stable set search_path='' as $$
declare result timestamptz;
begin
 if value is null or value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Use an ISO date and time with an explicit timezone';end if;
 result:=value::timestamptz;
 if result<'1900-01-01'::timestamptz or result>clock_timestamp() then raise exception 'Financial date must not be in the future';end if;return result;
end $$;
create function private.finance_transaction(t uuid,kind text,k uuid,payload jsonb,reason text,at_time timestamptz,currency text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;employee uuid;
begin
 select id into employee from public.employees where tenant_id=t and user_id=auth.uid() and status='active';
 insert into public.financial_transactions(tenant_id,kind,currency,idempotency_key,request_payload,reason,actor_id,actor_name,employee_id,occurred_at)
 values(t,kind,currency,k,payload,reason,auth.uid(),coalesce(private.finance_actor_name(),'Business member'),employee,at_time) returning id into result;return result;
end $$;
create function private.cash_operation_audit(t uuid,c uuid,x uuid,k uuid,payload jsonb,op text,reason text,detail jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 insert into public.financial_audit_events(tenant_id,cashbox_id,transaction_id,operation,actor_id,actor_name,request_key,request_payload,reason,after_data)
 values(t,c,x,op,auth.uid(),coalesce(private.finance_actor_name(),'Business member'),k,payload,reason,detail) returning id into result;return result;
end $$;
create function private.payment_credit(t uuid,p uuid) returns numeric language sql stable security definer set search_path='' as $$
 select amount-coalesce((select sum(amount) from public.payment_allocations where tenant_id=t and payment_id=p),0) from public.payments where tenant_id=t and id=p;
$$;
create function private.post_allocation(t uuid,p uuid,i uuid,n numeric,k uuid,reason text,original uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare payment public.payments;invoice public.invoices;a public.payment_allocations;available numeric;remaining numeric;event uuid;result uuid;payload jsonb;replay uuid;
begin
 payload:=jsonb_build_object('operation','allocate','payment_id',p,'invoice_id',i,'amount',n::numeric(18,2)::text,'original',original,'reason',reason);
 replay:=private.finance_command(t,k,payload);
 if not private.payment_allowed(t,p,'payments.allocate') or not private.invoice_allowed(t,i,'debts.view')
 or not private.invoice_allowed(t,i,'payments.allocate') then raise exception using errcode='42501',message='Payment allocation denied';end if;
 if replay is not null then select id into result from public.payment_allocations where tenant_id=t and audit_event_id=replay;return result;end if;
 select * into payment from public.payments where tenant_id=t and id=p for update;
 select * into invoice from public.invoices where tenant_id=t and id=i for update;
 if invoice.state<>'issued' or invoice.customer_id<>payment.customer_id or invoice.currency<>payment.currency then raise exception 'Choose an issued invoice for the same customer and currency';end if;
 if n>0 then
  select coalesce(sum(amount),0) into remaining from public.invoice_receivable_entries where tenant_id=t and invoice_id=i;
  if n>private.payment_credit(t,p) or n>remaining then raise exception 'Allocation exceeds payment credit or invoice balance';end if;
  if original is not null then raise exception 'Invalid allocation source';end if;
 else
  if n=0 or length(trim(reason)) not between 3 and 1000 then raise exception 'A release needs a positive amount and reason';end if;
  select * into a from public.payment_allocations where tenant_id=t and id=original and payment_id=p and invoice_id=i and amount>0;
  if not found then raise exception 'Original allocation not found';end if;
  select a.amount+coalesce(sum(amount),0) into available from public.payment_allocations where tenant_id=t and reversal_of=a.id;
  if -n>available then raise exception 'Release exceeds the remaining allocation';end if;
 end if;
 event:=private.invoice_audit(t,i,case when n>0 then 'invoice_allocated' else 'invoice_allocation_released' end,k,payload,reason,null,
 jsonb_build_object('payment_id',p,'amount',n::numeric(18,2)::text,'original',original));
 insert into public.payment_allocations(tenant_id,payment_id,invoice_id,customer_id,currency,amount,reversal_of,audit_event_id)
 values(t,p,i,payment.customer_id,payment.currency,n,original,event) returning id into result;
 insert into public.invoice_receivable_entries(tenant_id,invoice_id,currency,kind,amount,audit_event_id,allocation_id)
 values(t,i,payment.currency,case when n>0 then 'allocation' else 'allocation_release' end,-n,event,result);return result;
end $$;
create function public.allocate_payment(p_tenant uuid,p_payment uuid,p_invoice uuid,p_request uuid,p_amount text,p_reason text default '',p_original uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare amount numeric;
begin
 amount:=private.finance_amount(p_amount);if amount<=0 then raise exception 'Allocation amount must be positive';end if;
 if p_reason is null or length(p_reason)>1000 then raise exception 'Invalid reason';end if;
 return private.post_allocation(p_tenant,p_payment,p_invoice,case when p_original is null then amount else -amount end,p_request,trim(p_reason),p_original);
end $$;
create function public.post_payment(p_tenant uuid,p_request uuid,p_data jsonb,p_allocations jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;c public.customers;p uuid;branch uuid;amount numeric;at_time timestamptz;payload jsonb;allocations jsonb:='[]'::jsonb;item jsonb;n numeric;replay uuid;x uuid;event uuid;
begin
 branch:=(p_data->>'branch_id')::uuid;amount:=private.finance_amount(p_data->>'amount');at_time:=private.finance_time(p_data->>'paid_at');
 if amount<=0 or jsonb_typeof(p_data->'amount') is distinct from 'string' or coalesce(p_data->>'method','') not in ('cash','bank_transfer','card_terminal','other')
 or length(coalesce(p_data->>'external_reference',''))>150 or length(coalesce(p_data->>'notes',''))>2000 or jsonb_typeof(p_allocations) is distinct from 'array'
 then raise exception 'Invalid payment details';end if;
 if jsonb_array_length(p_allocations)>100 then raise exception 'Too many invoice allocations';end if;
 for item in select value from jsonb_array_elements(p_allocations) order by value->>'invoice_id' loop
  if jsonb_typeof(item->'amount') is distinct from 'string' then raise exception 'Money must be decimal text';end if;
  n:=private.finance_amount(item->>'amount');if n<=0 then raise exception 'Allocation must be positive';end if;
  if exists(select 1 from jsonb_array_elements(allocations) a where a->>'invoice_id'=item->>'invoice_id') then raise exception 'Duplicate invoice in payment allocations';end if;
  allocations:=allocations||jsonb_build_array(jsonb_build_object('invoice_id',(item->>'invoice_id')::uuid,'amount',n::text));
 end loop;
 payload:=jsonb_build_object('operation','payment','branch_id',branch,'customer_id',(p_data->>'customer_id')::uuid,'cashbox_id',(p_data->>'cashbox_id')::uuid,
 'amount',amount::text,'paid_at',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'method',p_data->>'method',
 'external_reference',coalesce(p_data->>'external_reference',''),'notes',coalesce(p_data->>'notes',''),'allocations',allocations);
 replay:=private.finance_command(p_tenant,p_request,payload);
 if not private.has_permission(p_tenant,'payments.view',branch) or not private.has_permission(p_tenant,'payments.create',branch)
 or not private.cashbox_allowed(p_tenant,(p_data->>'cashbox_id')::uuid) then raise exception using errcode='42501',message='Payment creation denied';end if;
 if replay is not null then select id into p from public.payments where tenant_id=p_tenant and transaction_id=(select transaction_id from public.financial_audit_events where id=replay);
  if not private.payment_allowed(p_tenant,p) then raise exception using errcode='42501',message='Payment access changed';end if;return p;end if;
 select * into c from public.customers where tenant_id=p_tenant and id=(p_data->>'customer_id')::uuid for update;
 if not found or c.archived_at is not null or not exists(select 1 from public.customer_branches where tenant_id=p_tenant and customer_id=c.id and branch_id=branch)
 then raise exception 'Choose an active customer in the payment branch';end if;
 if not exists(select 1 from public.branches where tenant_id=p_tenant and id=branch and is_active) then raise exception 'Choose an active branch';end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=(p_data->>'cashbox_id')::uuid for update;
 if b.branch_id is not null and b.branch_id<>branch then raise exception 'Cashbox must belong to the payment branch or be business-wide';end if;
 x:=private.finance_transaction(p_tenant,'payment',p_request,payload,'Manual payment',at_time,b.currency);
 insert into public.payments(tenant_id,branch_id,customer_id,cashbox_id,transaction_id,currency,amount,method,paid_at,external_reference,notes,customer_name)
 values(p_tenant,branch,c.id,b.id,x,b.currency,amount,p_data->>'method',at_time,coalesce(p_data->>'external_reference',''),coalesce(p_data->>'notes',''),trim(c.first_name||' '||c.last_name)) returning id into p;
 insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values(p_tenant,x,b.id,'payment',b.currency,amount);
 event:=private.cash_operation_audit(p_tenant,b.id,x,p_request,payload,'payment','Manual payment',jsonb_build_object('payment_id',p,'amount',amount::text,'currency',b.currency));
 for item in select value from jsonb_array_elements(allocations) loop
  perform private.post_allocation(p_tenant,p,(item->>'invoice_id')::uuid,(item->>'amount')::numeric,gen_random_uuid(),'Allocated when payment recorded');
 end loop;
 if event is null then raise exception 'Payment audit missing';end if;return p;
end $$;
revoke all on function private.finance_command(uuid,uuid,jsonb),private.finance_time(text),private.finance_transaction(uuid,text,uuid,jsonb,text,timestamptz,text),private.cash_operation_audit(uuid,uuid,uuid,uuid,jsonb,text,text,jsonb),private.payment_credit(uuid,uuid),private.post_allocation(uuid,uuid,uuid,numeric,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.allocate_payment(uuid,uuid,uuid,uuid,text,text,uuid),public.post_payment(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.allocate_payment(uuid,uuid,uuid,uuid,text,text,uuid),public.post_payment(uuid,uuid,jsonb,jsonb) to authenticated;
