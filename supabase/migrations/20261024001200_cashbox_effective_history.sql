create or replace function public.cashbox_details(p_tenant uuid,p_cashbox uuid,p_filters jsonb default '{}',p_page integer default 0,p_audit_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;b public.cashboxes;zone text;date_from date;date_to date;filter_kind text:=coalesce(p_filters->>'kind','');actor uuid;
begin
 if not private.cashbox_allowed(p_tenant,p_cashbox) then raise exception using errcode='42501',message='Cashbox access denied';end if;
 if p_page is null or p_audit_page is null or p_page not between 0 and 100000 or p_audit_page not between 0 and 100000
 or filter_kind not in ('','opening_balance','adjustment','payment','expense','transfer','refund','reversal') then raise exception 'Invalid ledger filters';end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=p_cashbox;
 select timezone into zone from public.tenants where id=p_tenant;
 date_from:=nullif(p_filters->>'from','')::date;date_to:=nullif(p_filters->>'to','')::date;
 if date_from>date_to then raise exception 'Date range is reversed';end if;
 actor:=nullif(p_filters->>'actor','')::uuid;
 with entries as materialized (
  select e.id,e.amount,e.currency,x.id transaction_id,x.kind,x.reason,x.actor_id,x.actor_name,x.employee_id,coalesce(x.occurred_at,x.posted_at) posted_at
  from public.financial_ledger_entries e join public.financial_transactions x on x.tenant_id=e.tenant_id and x.id=e.transaction_id
  where e.tenant_id=p_tenant and e.cashbox_id=p_cashbox
 ), filtered as materialized (
  select * from entries where (filter_kind='' or entries.kind=filter_kind) and (actor is null or actor_id=actor)
  and (date_from is null or posted_at>=date_from::timestamp at time zone zone)
  and (date_to is null or posted_at<(date_to+1)::timestamp at time zone zone)
 ), page as(select * from filtered order by posted_at desc,transaction_id desc limit 20 offset p_page*20),
 audits as materialized(select * from public.financial_audit_events a where a.tenant_id=p_tenant and a.cashbox_id=p_cashbox
 and private.cashbox_allowed(p_tenant,p_cashbox,'finance.audit.view') and (a.transaction_id is null or private.financial_transaction_allowed(p_tenant,a.transaction_id)))
 select jsonb_build_object('cashbox',to_jsonb(b)-'creation_payload'-'creation_key',
 'branch_name',(select name from public.branches where tenant_id=p_tenant and id=b.branch_id),
 'balance',(select round(coalesce(sum(amount),0),2)::text from entries),
 'has_entries',exists(select 1 from entries),'total',(select count(*) from filtered),
 'rows',coalesce((select jsonb_agg((to_jsonb(page)-'amount')||jsonb_build_object('amount',round(amount,2)::text) order by posted_at desc,transaction_id desc) from page),'[]'),
 'actors',coalesce((select jsonb_agg(to_jsonb(a) order by a.name,a.id) from (select distinct on(actor_id) actor_id id,actor_name name from entries order by actor_id,posted_at desc,transaction_id desc limit 200) a),'[]'),
 'audit_total',(select count(*) from audits),'audit',coalesce((select jsonb_agg(to_jsonb(a) order by created_at desc,id desc)
 from(select id,operation,actor_name,reason,before_data,after_data,created_at from audits order by created_at desc,id desc limit 20 offset p_audit_page*20) a),'[]')) into result;
 return result;
end $$;
