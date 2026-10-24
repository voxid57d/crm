create function private.payment_rows(t uuid,filters jsonb default '{}') returns table(id uuid,branch_id uuid,customer_id uuid,cashbox_id uuid,currency text,
 amount numeric,allocated numeric,credit numeric,method text,paid_at timestamptz,external_reference text,notes text,customer_name text,cashbox_name text,actor_id uuid,actor_name text)
language plpgsql stable security definer set search_path='' as $$
declare branch uuid;customer uuid;box uuid;actor uuid;after_date date;before_date date;zone text;identifier uuid;
begin
 if not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Payment access denied';end if;
 branch:=nullif(filters->>'branch','')::uuid;customer:=nullif(filters->>'customer','')::uuid;box:=nullif(filters->>'cashbox','')::uuid;actor:=nullif(filters->>'actor','')::uuid;identifier:=nullif(filters->>'payment','')::uuid;
 after_date:=nullif(filters->>'from','')::date;before_date:=nullif(filters->>'to','')::date;
 if after_date>before_date or length(coalesce(filters->>'q',''))>100 or coalesce(filters->>'method','') not in ('','cash','bank_transfer','card_terminal','other') then raise exception 'Invalid payment filters';end if;
 if branch is not null and not private.has_permission(t,'payments.view',branch) then raise exception using errcode='42501',message='Payment branch denied';end if;
 select timezone into zone from public.tenants where public.tenants.id=t;
 return query select p.id,p.branch_id,p.customer_id,p.cashbox_id,p.currency,p.amount,
 coalesce((select sum(a.amount) from public.payment_allocations a where a.tenant_id=t and a.payment_id=p.id),0),private.payment_credit(t,p.id),p.method,p.paid_at,
 p.external_reference,p.notes,p.customer_name,b.name,x.actor_id,x.actor_name from public.payments p
 join public.cashboxes b on b.tenant_id=p.tenant_id and b.id=p.cashbox_id join public.financial_transactions x on x.tenant_id=p.tenant_id and x.id=p.transaction_id
 where p.tenant_id=t and private.payment_allowed(t,p.id) and (branch is null or p.branch_id=branch) and (customer is null or p.customer_id=customer)
 and (box is null or p.cashbox_id=box) and (actor is null or x.actor_id=actor) and (identifier is null or p.id=identifier)
 and (coalesce(filters->>'method','')='' or p.method=filters->>'method')
 and position(lower(coalesce(filters->>'q','')) in lower(p.customer_name||' '||p.external_reference))>0
 and (after_date is null or p.paid_at>=after_date::timestamp at time zone zone) and (before_date is null or p.paid_at<(before_date+1)::timestamp at time zone zone);
end $$;
create function public.payment_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid payment page';end if;
 with rows as materialized(select * from private.payment_rows(p_tenant,p_filters)),page as(select * from rows order by paid_at desc,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg((to_jsonb(page)-array['amount','allocated','credit'])||
 jsonb_build_object('amount',round(amount,2)::text,'allocated',round(allocated,2)::text,'credit',round(credit,2)::text) order by paid_at desc,id) from page),'[]')) into result;return result;
end $$;
create function public.payment_details(p_tenant uuid,p_payment uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.payment_allowed(p_tenant,p_payment) then raise exception using errcode='42501',message='Payment access denied';end if;
 select jsonb_build_object('payment',(to_jsonb(p)-array['amount','allocated','credit'])||jsonb_build_object('amount',round(amount,2)::text,'allocated',round(allocated,2)::text,'credit',round(credit,2)::text),
 'allocations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'invoice_id',a.invoice_id,'invoice_number',h.invoice_number,'amount',round(a.amount,2)::text,
 'remaining',round(a.amount+coalesce((select sum(r.amount) from public.payment_allocations r where r.tenant_id=p_tenant and r.reversal_of=a.id),0),2)::text,
 'reversal_of',a.reversal_of,'created_at',a.created_at,'reason',e.reason,'actor_name',e.actor_name) order by a.created_at,a.id)
 from public.payment_allocations a join public.invoices h on h.tenant_id=a.tenant_id and h.id=a.invoice_id join public.financial_audit_events e on e.id=a.audit_event_id
 where a.tenant_id=p_tenant and a.payment_id=p_payment and private.invoice_allowed(p_tenant,a.invoice_id)),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'outstanding',round(i.outstanding,2)::text,'branch_id',i.branch_id) order by i.due_date,i.id)
 from private.invoice_rows(p_tenant,'payments.allocate',jsonb_build_object('customer',p.customer_id)) i where i.state='issued' and i.outstanding>0),'[]')) into result
 from private.payment_rows(p_tenant,jsonb_build_object('payment',p_payment)) p;return result;
end $$;
create function public.payment_customer_choices(p_tenant uuid,p_branch uuid,p_search text default '') returns table(id uuid,name text,phone text)
language sql stable security definer set search_path='' as $$
 select c.id,trim(c.first_name||' '||c.last_name),c.phone from public.customers c where c.tenant_id=p_tenant and c.archived_at is null and length(p_search)<=100
 and private.has_permission(p_tenant,'payments.view',p_branch) and private.has_permission(p_tenant,'payments.create',p_branch)
 and exists(select 1 from public.customer_branches b where b.tenant_id=p_tenant and b.customer_id=c.id and b.branch_id=p_branch)
 and position(lower(p_search) in lower(c.first_name||' '||c.last_name||' '||c.phone))>0 order by c.first_name,c.last_name,c.id limit 20;
$$;
revoke all on function private.payment_rows(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.payment_directory(uuid,jsonb,integer),public.payment_details(uuid,uuid),public.payment_customer_choices(uuid,uuid,text) from public,anon;
grant execute on function public.payment_directory(uuid,jsonb,integer),public.payment_details(uuid,uuid),public.payment_customer_choices(uuid,uuid,text) to authenticated;
