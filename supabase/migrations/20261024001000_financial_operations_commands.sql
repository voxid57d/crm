create function public.save_expense_category(p_tenant uuid,p_id uuid,p_name text,p_active boolean,p_version integer default 0) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.expense_categories;before_value jsonb;
begin
 if not private.has_permission(p_tenant,'expenses.manage') then raise exception using errcode='42501',message='Category management denied';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 or p_active is null then raise exception 'Invalid category';end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if p_id is null then insert into public.expense_categories(tenant_id,name,is_active) values(p_tenant,trim(p_name),p_active) returning * into c;
 else
  select * into c from public.expense_categories where tenant_id=p_tenant and id=p_id for update;
  if not found or c.version is distinct from p_version then raise exception 'Category changed or missing; reload';end if;before_value:=to_jsonb(c);
  update public.expense_categories set name=trim(p_name),is_active=p_active,version=version+1 where id=p_id returning * into c;
 end if;
 insert into public.financial_configuration_events(tenant_id,category_id,actor_id,actor_name,before_data,after_data)
 values(p_tenant,c.id,auth.uid(),coalesce(private.finance_actor_name(),'Business member'),before_value,to_jsonb(c));return c.id;
end $$;
create function public.set_cashbox_overdraft(p_tenant uuid,p_cashbox uuid,p_request uuid,p_allow boolean,p_version integer,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;payload jsonb;replay uuid;
begin
 if not exists(select 1 from public.tenants where id=p_tenant and owner_id=auth.uid()) or not private.cashbox_allowed(p_tenant,p_cashbox,'cashboxes.manage')
 then raise exception using errcode='42501',message='Only the business owner can change overdraft policy';end if;
 if p_allow is null or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Policy and reason required';end if;
 payload:=jsonb_build_object('operation','overdraft','cashbox',p_cashbox,'allow',p_allow,'version',p_version,'reason',trim(p_reason));replay:=private.finance_command(p_tenant,p_request,payload);
 if replay is not null then return p_cashbox;end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=p_cashbox for update;
 if b.version is distinct from p_version then raise exception 'Cashbox changed; reload';end if;
 if not p_allow and (select coalesce(sum(amount),0) from public.financial_ledger_entries where tenant_id=p_tenant and cashbox_id=p_cashbox)<0 then raise exception 'Restore a nonnegative balance before disabling overdraft';end if;
 update public.cashboxes set allow_negative=p_allow,version=version+1,updated_at=now() where id=p_cashbox;
 insert into public.financial_audit_events(tenant_id,cashbox_id,operation,actor_id,actor_name,reason,before_data,after_data,request_key,request_payload)
 values(p_tenant,p_cashbox,'cashbox_updated',auth.uid(),coalesce(private.finance_actor_name(),'Business member'),trim(p_reason),jsonb_build_object('allow_negative',b.allow_negative),jsonb_build_object('allow_negative',p_allow),p_request,payload);return p_cashbox;
end $$;
create function public.post_expense(p_tenant uuid,p_request uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;c public.expense_categories;branch uuid;n numeric;at_time timestamptz;payload jsonb;replay uuid;x uuid;result uuid;
begin
 branch:=(p_data->>'branch_id')::uuid;n:=private.finance_amount(p_data->>'amount');at_time:=private.finance_time(p_data->>'occurred_at');
 if n<=0 or jsonb_typeof(p_data->'amount') is distinct from 'string' or length(trim(coalesce(p_data->>'description',''))) not between 3 and 1000 or length(coalesce(p_data->>'vendor',''))>150 then raise exception 'Invalid expense details';end if;
 payload:=jsonb_build_object('operation','expense','branch_id',branch,'cashbox_id',(p_data->>'cashbox_id')::uuid,'category_id',(p_data->>'category_id')::uuid,'amount',n::text,'at',at_time,'description',trim(p_data->>'description'),'vendor',coalesce(p_data->>'vendor',''));
 replay:=private.finance_command(p_tenant,p_request,payload);
 if not private.has_permission(p_tenant,'expenses.view',branch) or not private.has_permission(p_tenant,'expenses.create',branch) or not private.cashbox_allowed(p_tenant,(p_data->>'cashbox_id')::uuid) then raise exception using errcode='42501',message='Expense creation denied';end if;
 if replay is not null then select id into result from public.expenses where tenant_id=p_tenant and transaction_id=(select transaction_id from public.financial_audit_events where id=replay);return result;end if;
 if not exists(select 1 from public.branches where tenant_id=p_tenant and id=branch and is_active) then raise exception 'Choose an active branch';end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=(p_data->>'cashbox_id')::uuid for update;
 if b.branch_id is not null and b.branch_id<>branch then raise exception 'Expense cashbox must be in the same branch or business-wide';end if;
 select * into c from public.expense_categories where tenant_id=p_tenant and id=(p_data->>'category_id')::uuid and is_active;
 if not found then raise exception 'Choose an active expense category';end if;
 x:=private.finance_transaction(p_tenant,'expense',p_request,payload,trim(p_data->>'description'),at_time,b.currency);
 insert into public.expenses(tenant_id,branch_id,cashbox_id,category_id,transaction_id,currency,amount,occurred_at,description,vendor,category_name)
 values(p_tenant,branch,b.id,c.id,x,b.currency,n,at_time,trim(p_data->>'description'),coalesce(p_data->>'vendor',''),c.name) returning id into result;
 insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values(p_tenant,x,b.id,'expense',b.currency,-n);
 perform private.cash_operation_audit(p_tenant,b.id,x,p_request,payload,'expense',trim(p_data->>'description'),jsonb_build_object('expense_id',result,'amount',n::text));return result;
end $$;
create function public.post_cashbox_transfer(p_tenant uuid,p_request uuid,p_source uuid,p_destination uuid,p_amount text,p_at text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.cashboxes;b public.cashboxes;n numeric;at_time timestamptz;payload jsonb;replay uuid;x uuid;result uuid;
begin
 n:=private.finance_amount(p_amount);at_time:=private.finance_time(p_at);
 if n<=0 or p_source is null or p_destination is null or p_source=p_destination or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Choose different cashboxes, positive amount and reason';end if;
 payload:=jsonb_build_object('operation','transfer','source',p_source,'destination',p_destination,'amount',n::text,'at',at_time,'reason',trim(p_reason));replay:=private.finance_command(p_tenant,p_request,payload);
 if not private.cashbox_allowed(p_tenant,p_source,'cashboxes.transfer') or not private.cashbox_allowed(p_tenant,p_destination,'cashboxes.transfer') then raise exception using errcode='42501',message='Transfer requires access to both cashboxes';end if;
 if replay is not null then select id into result from public.cashbox_transfers where tenant_id=p_tenant and transaction_id=(select transaction_id from public.financial_audit_events where id=replay);return result;end if;
 perform 1 from public.cashboxes where tenant_id=p_tenant and id in(p_source,p_destination) order by id for update;
 select * into a from public.cashboxes where tenant_id=p_tenant and id=p_source;select * into b from public.cashboxes where tenant_id=p_tenant and id=p_destination;
 if a.currency<>b.currency then raise exception 'Transfers require the same currency';end if;
 x:=private.finance_transaction(p_tenant,'transfer',p_request,payload,trim(p_reason),at_time,a.currency);
 insert into public.cashbox_transfers(tenant_id,source_id,destination_id,transaction_id,currency,amount,occurred_at) values(p_tenant,a.id,b.id,x,a.currency,n,at_time) returning id into result;
 insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values(p_tenant,x,a.id,'transfer',a.currency,-n),(p_tenant,x,b.id,'transfer',a.currency,n);
 perform private.cash_operation_audit(p_tenant,a.id,x,p_request,payload,'transfer',trim(p_reason),jsonb_build_object('amount',n::text));return result;
end $$;
create function public.post_payment_refund(p_tenant uuid,p_payment uuid,p_request uuid,p_cashbox uuid,p_amount text,p_at text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.payments;b public.cashboxes;n numeric;at_time timestamptz;payload jsonb;replay uuid;x uuid;result uuid;needed numeric;a record;release_amount numeric;
begin
 n:=private.finance_amount(p_amount);at_time:=private.finance_time(p_at);
 if n<=0 or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'A refund requires positive amount and reason';end if;
 payload:=jsonb_build_object('operation','refund','payment',p_payment,'cashbox',p_cashbox,'amount',n::text,'at',at_time,'reason',trim(p_reason));replay:=private.finance_command(p_tenant,p_request,payload);
 if not private.payment_allowed(p_tenant,p_payment,'payments.refund') or not private.cashbox_allowed(p_tenant,p_cashbox) then raise exception using errcode='42501',message='Refund denied';end if;
 if replay is not null then select id into result from public.payment_refunds where tenant_id=p_tenant and transaction_id=(select transaction_id from public.financial_audit_events where id=replay);return result;end if;
 select * into p from public.payments where tenant_id=p_tenant and id=p_payment for update;
 if n>p.amount-coalesce((select sum(amount) from public.payment_refunds where tenant_id=p_tenant and payment_id=p.id),0) then raise exception 'Refund exceeds remaining original payment';end if;
 if at_time<p.paid_at then raise exception 'Refund cannot precede the original payment';end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=p_cashbox for update;
 if (b.branch_id is not null and b.branch_id<>p.branch_id) or b.currency<>p.currency then raise exception 'Refund cashbox must match payment branch and currency';end if;
 needed:=greatest(n-private.payment_credit(p_tenant,p.id),0);
 for a in select h.*,h.amount+coalesce((select sum(r.amount) from public.payment_allocations r where r.tenant_id=p_tenant and r.reversal_of=h.id),0) remaining
  from public.payment_allocations h where h.tenant_id=p_tenant and h.payment_id=p.id and h.amount>0 order by h.created_at desc,h.id loop
  exit when needed=0;release_amount:=least(needed,a.remaining);
  if release_amount>0 then perform private.post_allocation(p_tenant,p.id,a.invoice_id,-release_amount,gen_random_uuid(),'Refund: '||left(trim(p_reason),990),a.id);needed:=needed-release_amount;end if;
 end loop;
 if needed>0 then raise exception 'Unable to unwind refund allocations';end if;
 x:=private.finance_transaction(p_tenant,'refund',p_request,payload,trim(p_reason),at_time,p.currency);
 insert into public.payment_refunds(tenant_id,payment_id,cashbox_id,transaction_id,currency,amount,occurred_at) values(p_tenant,p.id,b.id,x,p.currency,n,at_time) returning id into result;
 insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values(p_tenant,x,b.id,'refund',p.currency,-n);
 perform private.cash_operation_audit(p_tenant,b.id,x,p_request,payload,'refund',trim(p_reason),jsonb_build_object('refund_id',result,'amount',n::text));return result;
end $$;
create function public.reverse_financial_transaction(p_tenant uuid,p_transaction uuid,p_request uuid,p_at text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare original public.financial_transactions;x uuid;at_time timestamptz;payload jsonb;replay uuid;entry record;box uuid;
begin
 at_time:=private.finance_time(p_at);
 if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Reversal reason required';end if;
 payload:=jsonb_build_object('operation','reversal','transaction',p_transaction,'at',at_time,'reason',trim(p_reason));replay:=private.finance_command(p_tenant,p_request,payload);
 if not private.financial_transaction_allowed(p_tenant,p_transaction) or exists(select 1 from public.financial_ledger_entries e where e.tenant_id=p_tenant and e.transaction_id=p_transaction and not private.cashbox_allowed(p_tenant,e.cashbox_id,'finance.reverse')) then raise exception using errcode='42501',message='Reversal denied';end if;
 select * into original from public.financial_transactions where tenant_id=p_tenant and id=p_transaction;
 if original.kind not in ('opening_balance','adjustment','expense','transfer') then raise exception 'Use a linked refund for payments; this posting cannot be reversed';end if;
 if original.kind='expense' and not exists(select 1 from public.expenses where tenant_id=p_tenant and transaction_id=original.id and private.expense_allowed(p_tenant,id,'finance.reverse')) then raise exception using errcode='42501',message='Expense reversal denied';end if;
 if replay is not null then return (select transaction_id from public.financial_audit_events where id=replay);end if;
 if exists(select 1 from public.financial_transactions where tenant_id=p_tenant and reversal_of=original.id) then raise exception 'Posting already reversed';end if;
 if at_time<coalesce(original.occurred_at,original.posted_at) then raise exception 'Reversal cannot precede original posting';end if;
 perform 1 from public.cashboxes where tenant_id=p_tenant and id in(select cashbox_id from public.financial_ledger_entries where tenant_id=p_tenant and transaction_id=original.id) order by id for update;
 insert into public.financial_transactions(tenant_id,kind,currency,idempotency_key,request_payload,reason,actor_id,actor_name,occurred_at,reversal_of)
 values(p_tenant,'reversal',original.currency,p_request,payload,trim(p_reason),auth.uid(),coalesce(private.finance_actor_name(),'Business member'),at_time,original.id) returning id into x;
 for entry in select * from public.financial_ledger_entries where tenant_id=p_tenant and transaction_id=original.id order by cashbox_id loop
  insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values(p_tenant,x,entry.cashbox_id,'reversal',original.currency,-entry.amount);box:=entry.cashbox_id;
 end loop;
 perform private.cash_operation_audit(p_tenant,box,x,p_request,payload,'reversal',trim(p_reason),jsonb_build_object('reversal_of',original.id));return x;
end $$;
revoke all on function public.save_expense_category(uuid,uuid,text,boolean,integer),public.set_cashbox_overdraft(uuid,uuid,uuid,boolean,integer,text),public.post_expense(uuid,uuid,jsonb),public.post_cashbox_transfer(uuid,uuid,uuid,uuid,text,text,text),public.post_payment_refund(uuid,uuid,uuid,uuid,text,text,text),public.reverse_financial_transaction(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.save_expense_category(uuid,uuid,text,boolean,integer),public.set_cashbox_overdraft(uuid,uuid,uuid,boolean,integer,text),public.post_expense(uuid,uuid,jsonb),public.post_cashbox_transfer(uuid,uuid,uuid,uuid,text,text,text),public.post_payment_refund(uuid,uuid,uuid,uuid,text,text,text),public.reverse_financial_transaction(uuid,uuid,uuid,text,text) to authenticated;
