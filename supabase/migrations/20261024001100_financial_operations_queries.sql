create function private.operation_rows(t uuid,kind_filter text,filters jsonb default '{}') returns table(
 id uuid,kind text,branch_id uuid,customer_id uuid,payment_id uuid,cashbox_id uuid,destination_id uuid,category_id uuid,transaction_id uuid,
 amount numeric,currency text,occurred_at timestamptz,reason text,actor_id uuid,actor_name text,cashbox_name text,destination_name text,category_name text,customer_name text,vendor text,reversed boolean)
language plpgsql stable security definer set search_path='' as $$
declare branch uuid;customer uuid;box uuid;actor uuid;category uuid;identifier uuid;date_from date;date_to date;zone text;
begin
 if not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Financial access denied';end if;
 if kind_filter not in ('expense','transfer','refund') then raise exception 'Invalid financial operation';end if;
 branch:=nullif(filters->>'branch','')::uuid;customer:=nullif(filters->>'customer','')::uuid;box:=nullif(filters->>'cashbox','')::uuid;
 actor:=nullif(filters->>'actor','')::uuid;category:=nullif(filters->>'category','')::uuid;identifier:=nullif(filters->>'id','')::uuid;
 date_from:=nullif(filters->>'from','')::date;date_to:=nullif(filters->>'to','')::date;
 if date_from>date_to or length(coalesce(filters->>'q',''))>100 then raise exception 'Invalid financial filters';end if;
 select timezone into zone from public.tenants where public.tenants.id=t;
 return query with sources as (
 select e.id,'expense'::text kind,e.branch_id,null::uuid customer_id,null::uuid payment_id,e.cashbox_id,null::uuid destination_id,e.category_id,e.transaction_id,e.amount,e.currency,e.occurred_at,e.category_name,''::text customer_name,e.vendor
 from public.expenses e where kind_filter='expense' and e.tenant_id=t and private.expense_allowed(t,e.id)
 union all
 select r.id,'refund',p.branch_id,p.customer_id,r.payment_id,r.cashbox_id,null::uuid,null::uuid,r.transaction_id,r.amount,r.currency,r.occurred_at,'',p.customer_name,''
 from public.payment_refunds r join public.payments p on p.tenant_id=r.tenant_id and p.id=r.payment_id
 where kind_filter='refund' and r.tenant_id=t and private.payment_allowed(t,r.payment_id) and private.cashbox_allowed(t,r.cashbox_id)
 union all
 select s.id,'transfer',b.branch_id,null::uuid,null::uuid,s.source_id,s.destination_id,null::uuid,s.transaction_id,s.amount,s.currency,s.occurred_at,'','',''
 from public.cashbox_transfers s join public.cashboxes b on b.tenant_id=s.tenant_id and b.id=s.source_id where kind_filter='transfer' and s.tenant_id=t and private.financial_transaction_allowed(t,s.transaction_id)
 ) select s.id,s.kind,s.branch_id,s.customer_id,s.payment_id,s.cashbox_id,s.destination_id,s.category_id,s.transaction_id,s.amount,s.currency,s.occurred_at,x.reason,x.actor_id,x.actor_name,b.name,d.name,s.category_name,s.customer_name,s.vendor,
 exists(select 1 from public.financial_transactions r where r.tenant_id=t and r.reversal_of=x.id)
 from sources s join public.financial_transactions x on x.tenant_id=t and x.id=s.transaction_id join public.cashboxes b on b.tenant_id=t and b.id=s.cashbox_id
 left join public.cashboxes d on d.tenant_id=t and d.id=s.destination_id
 where (branch is null or s.branch_id=branch or d.branch_id=branch) and (customer is null or s.customer_id=customer) and (box is null or s.cashbox_id=box or s.destination_id=box)
 and (actor is null or x.actor_id=actor) and (category is null or s.category_id=category) and (identifier is null or s.id=identifier)
 and (date_from is null or s.occurred_at>=date_from::timestamp at time zone zone) and (date_to is null or s.occurred_at<(date_to+1)::timestamp at time zone zone)
 and position(lower(coalesce(filters->>'q','')) in lower(x.reason||' '||s.vendor||' '||s.customer_name||' '||s.category_name))>0;
end $$;
create function public.financial_operation_directory(p_tenant uuid,p_kind text,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page';end if;
 with rows as materialized(select * from private.operation_rows(p_tenant,p_kind,p_filters)),page as(select * from rows order by occurred_at desc,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg((to_jsonb(page)-'amount')||jsonb_build_object('amount',round(amount,2)::text) order by occurred_at desc,id) from page),'[]')) into result;return result;
end $$;
create function public.financial_operation_details(p_tenant uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select (to_jsonb(s)-'amount')||jsonb_build_object('amount',round(s.amount,2)::text,'reversal',
 (select jsonb_build_object('id',x.id,'reason',x.reason,'actor_name',x.actor_name,'occurred_at',x.occurred_at) from public.financial_transactions x where x.tenant_id=p_tenant and x.reversal_of=s.transaction_id)) into result from private.operation_rows(p_tenant,p_kind,jsonb_build_object('id',p_id)) s;
 if result is null then raise exception using errcode='42501',message='Financial operation access denied';end if;return result;
end $$;
create function public.finance_operation_options(p_tenant uuid,p_kind text,p_branch uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_permission(p_tenant,'tenant.read') or p_kind not in ('expense','transfer','refund') then raise exception using errcode='42501',message='Financial options denied';end if;
 if p_kind='expense' and (p_branch is null or not private.has_permission(p_tenant,'expenses.view',p_branch) or not private.has_permission(p_tenant,'expenses.create',p_branch)) then raise exception using errcode='42501',message='Expense options denied';end if;
 if p_kind='refund' and (p_branch is null or not private.has_permission(p_tenant,'payments.view',p_branch) or not private.has_permission(p_tenant,'payments.refund',p_branch)) then raise exception using errcode='42501',message='Refund options denied';end if;
 select jsonb_build_object('cashboxes',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'branch_id',b.branch_id,'currency',b.currency) order by b.name,b.id)
 from public.cashboxes b where b.tenant_id=p_tenant and b.is_active and (b.branch_id is null or exists(select 1 from public.branches where tenant_id=p_tenant and id=b.branch_id and is_active))
 and private.cashbox_allowed(p_tenant,b.id,case when p_kind='transfer' then 'cashboxes.transfer' else 'cashboxes.view' end) and (p_kind='transfer' or b.branch_id is null or b.branch_id=p_branch)),'[]'),
 'categories',case when p_kind='expense' then coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from public.expense_categories c where c.tenant_id=p_tenant and c.is_active),'[]') else '[]'::jsonb end) into result;return result;
end $$;
create function public.expense_category_directory(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(p_tenant,'expenses.manage') then raise exception using errcode='42501',message='Category management denied';end if;
 return coalesce((select jsonb_agg(to_jsonb(c) order by name,id) from public.expense_categories c where c.tenant_id=p_tenant),'[]');
end $$;
revoke all on function private.operation_rows(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.financial_operation_directory(uuid,text,jsonb,integer),public.financial_operation_details(uuid,text,uuid),public.finance_operation_options(uuid,text,uuid),public.expense_category_directory(uuid) from public,anon;
grant execute on function public.financial_operation_directory(uuid,text,jsonb,integer),public.financial_operation_details(uuid,text,uuid),public.finance_operation_options(uuid,text,uuid),public.expense_category_directory(uuid) to authenticated;
