create function public.financial_dashboard(p_tenant uuid,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;can_pay boolean;can_debt boolean;can_expense boolean;can_cash boolean;zone text;branch uuid;received numeric;refunds numeric;expenses numeric;invoiced numeric;debt numeric;overdue numeric;balance numeric;movement numeric;
begin
 perform private.finance_report_check(p_tenant,p_filters,'finance.dashboard.view');branch:=nullif(p_filters->>'branch','')::uuid;select timezone into zone from public.tenants where id=p_tenant;
 select exists(select 1 from public.branches b where b.tenant_id=p_tenant and (branch is null or b.id=branch) and private.has_permission(p_tenant,'finance.dashboard.view',b.id) and private.has_permission(p_tenant,'payments.view',b.id)),
 exists(select 1 from public.branches b where b.tenant_id=p_tenant and (branch is null or b.id=branch) and private.has_permission(p_tenant,'finance.dashboard.view',b.id) and private.has_permission(p_tenant,'invoices.view',b.id) and private.has_permission(p_tenant,'debts.view',b.id)),
 exists(select 1 from public.branches b where b.tenant_id=p_tenant and (branch is null or b.id=branch) and private.has_permission(p_tenant,'finance.dashboard.view',b.id) and private.has_permission(p_tenant,'expenses.view',b.id)),
 exists(select 1 from public.cashboxes b where b.tenant_id=p_tenant and (branch is null or b.branch_id=branch) and private.has_permission(p_tenant,'finance.dashboard.view',b.branch_id) and private.cashbox_allowed(p_tenant,b.id))
 into can_pay,can_debt,can_expense,can_cash;
 if can_pay then
  select coalesce(sum((r->>'received')::numeric),0) into received from private.finance_report_rows(p_tenant,'payments',p_filters,'finance.dashboard.view') r;
  select coalesce(sum((r->>'amount')::numeric),0) into refunds from private.finance_report_rows(p_tenant,'refunds',p_filters,'finance.dashboard.view') r;
 end if;
 if can_debt then
  select coalesce(sum((r->>'invoiced')::numeric),0) into invoiced from private.finance_report_rows(p_tenant,'invoices',p_filters,'finance.dashboard.view') r where r->>'status' not in ('draft','voided','discarded');
  select coalesce(sum((r->>'outstanding')::numeric),0) into debt from private.finance_report_rows(p_tenant,'debts',p_filters-'from'-'to','finance.dashboard.view') r;
  select coalesce(sum((r->>'outstanding')::numeric),0) into overdue from private.finance_report_rows(p_tenant,'overdue',p_filters-'from'-'to','finance.dashboard.view') r;
 end if;
 if can_expense then select coalesce(sum(s.amount),0) into expenses from private.finance_expense_movements(p_tenant,p_filters,'finance.dashboard.view') s;end if;
 if can_cash then
  select coalesce(sum((r->>'balance')::numeric),0) into balance from private.finance_report_rows(p_tenant,'cashbox_balances',p_filters,'finance.dashboard.view') r;
  select coalesce(sum(s.amount),0) into movement from private.finance_cash_rows(p_tenant,p_filters,'finance.dashboard.view') s;
 end if;
 with daily as (
  select (p.paid_at at time zone zone)::date as trend_date,p.amount as received,0::numeric as refunds,0::numeric as expenses from private.payment_rows(p_tenant,p_filters) p where private.has_permission(p_tenant,'finance.dashboard.view',p.branch_id)
  union all select (r.occurred_at at time zone zone)::date,0,r.amount,0 from private.operation_rows(p_tenant,'refund',p_filters) r where private.has_permission(p_tenant,'finance.dashboard.view',r.branch_id)
  union all select (e.occurred_at at time zone zone)::date,0,0,e.amount from private.finance_expense_movements(p_tenant,p_filters,'finance.dashboard.view') e
 ), trends as(select trend_date,round(sum(daily.received),2)::text received,round(sum(daily.refunds),2)::text refunds,round(sum(daily.expenses),2)::text expenses from daily group by trend_date order by trend_date desc limit 60)
 select jsonb_build_object('metrics',jsonb_build_object('received',round(received,2)::text,'refunds',round(refunds,2)::text,'net_collections',round(received-refunds,2)::text,'expenses',round(expenses,2)::text,
 'invoiced',round(invoiced,2)::text,'outstanding',round(debt,2)::text,'overdue',round(overdue,2)::text,'cashbox_balance',round(balance,2)::text,'net_cash_movement',round(movement,2)::text),
 'trends',coalesce((select jsonb_agg(to_jsonb(trends) order by trend_date) from trends),'[]'),
 'branches',coalesce((select jsonb_agg(r order by r->>'branch') from private.finance_report_rows(p_tenant,'branches',p_filters,'finance.dashboard.view') r),'[]'),
 'recent',coalesce((select jsonb_agg(r order by r->>'date' desc,r->>'id') from(select r from private.finance_report_rows(p_tenant,'cashbox_transactions',p_filters,'finance.dashboard.view') r order by r->>'date' desc,r->>'id' limit 10) q),'[]')) into result;return result;
end $$;
create function public.financial_report_options(p_tenant uuid,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;branch uuid;
begin
 perform private.finance_report_check(p_tenant,p_filters,'finance.reports.view');branch:=nullif(p_filters->>'branch','')::uuid;
 with payments as materialized(select * from private.payment_rows(p_tenant,p_filters-'customer'-'actor'-'cashbox'-'from'-'to') p where private.has_permission(p_tenant,'finance.reports.view',p.branch_id)),
 invoices as materialized(select * from private.invoice_rows(p_tenant,'debts.view',p_filters-'customer'-'actor'-'cashbox'-'from'-'to') i where private.has_permission(p_tenant,'finance.reports.view',i.branch_id)),
 customers as(select customer_id id,customer_name name from payments union select customer_id,customer_name from invoices),
 actors as(select actor_id id,actor_name name from private.finance_cash_rows(p_tenant,p_filters-'actor'-'cashbox'-'from'-'to','finance.reports.view') union select actor_id,actor_name from payments)
 select jsonb_build_object('customers',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from(select distinct on(id) id,name from customers order by id,name limit 200) c),'[]'),
 'actors',coalesce((select jsonb_agg(to_jsonb(a) order by a.name,a.id) from(select distinct on(id) id,name from actors order by id,name limit 200) a),'[]'),
 'cashboxes',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name,b.id) from public.cashboxes b where b.tenant_id=p_tenant and private.cashbox_allowed(p_tenant,b.id) and private.has_permission(p_tenant,'finance.reports.view',b.branch_id) and (branch is null or b.branch_id=branch)),'[]'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id) from public.expense_categories c where c.tenant_id=p_tenant and (private.has_permission(p_tenant,'expenses.view') or exists(select 1 from public.branches b where b.tenant_id=p_tenant and (branch is null or b.id=branch) and private.has_permission(p_tenant,'expenses.view',b.id) and private.has_permission(p_tenant,'finance.reports.view',b.id)))),'[]')) into result;return result;
end $$;
revoke all on function public.financial_dashboard(uuid,jsonb),public.financial_report_options(uuid,jsonb) from public,anon;
grant execute on function public.financial_dashboard(uuid,jsonb),public.financial_report_options(uuid,jsonb) to authenticated;
