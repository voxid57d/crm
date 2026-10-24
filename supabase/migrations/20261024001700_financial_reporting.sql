-- 6E: checked reporting over the same immutable sources. Amounts leave SQL as text.
create function private.finance_report_check(t uuid,f jsonb,capability text) returns void language plpgsql stable security definer set search_path='' as $$
declare b uuid;d1 date;d2 date;ignored uuid;
begin
 if not private.has_permission(t,capability) and not exists(select 1 from public.branches where tenant_id=t and private.has_permission(t,capability,id)) then raise exception using errcode='42501',message='Financial reporting denied';end if;
 b:=nullif(f->>'branch','')::uuid;d1:=nullif(f->>'from','')::date;d2:=nullif(f->>'to','')::date;
 ignored:=nullif(f->>'customer','')::uuid;ignored:=nullif(f->>'cashbox','')::uuid;ignored:=nullif(f->>'actor','')::uuid;ignored:=nullif(f->>'category','')::uuid;
 if b is not null and not private.has_permission(t,capability,b) then raise exception using errcode='42501',message='Report branch denied';end if;
 if d1>d2 or length(coalesce(f->>'q',''))>100 or coalesce(f->>'method','') not in ('','cash','bank_transfer','card_terminal','other')
 or coalesce(f->>'kind','') not in ('','opening_balance','adjustment','payment','expense','transfer','refund','reversal') then raise exception 'Invalid report filters';end if;
end $$;
create function private.finance_in_period(t uuid,at_time timestamptz,f jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select (nullif(f->>'from','') is null or at_time>=((f->>'from')::date)::timestamp at time zone timezone)
 and (nullif(f->>'to','') is null or at_time<(((f->>'to')::date)+1)::timestamp at time zone timezone) from public.tenants where id=t;
$$;
create function private.finance_cash_rows(t uuid,f jsonb,capability text) returns table(id uuid,transaction_id uuid,cashbox_id uuid,branch_id uuid,cashbox_name text,branch_name text,amount numeric,kind text,occurred_at timestamptz,actor_id uuid,actor_name text,reason text,original_kind text)
language sql stable security definer set search_path='' as $$
 select e.id,x.id,b.id,b.branch_id,b.name,coalesce(br.name,'Business-wide'),e.amount,x.kind,coalesce(x.occurred_at,x.posted_at),x.actor_id,x.actor_name,x.reason,o.kind
 from public.financial_ledger_entries e join public.financial_transactions x on x.tenant_id=e.tenant_id and x.id=e.transaction_id
 join public.cashboxes b on b.tenant_id=e.tenant_id and b.id=e.cashbox_id left join public.branches br on br.tenant_id=b.tenant_id and br.id=b.branch_id
 left join public.financial_transactions o on o.tenant_id=x.tenant_id and o.id=x.reversal_of
 where e.tenant_id=t and private.cashbox_allowed(t,b.id) and private.has_permission(t,capability,b.branch_id)
 and (nullif(f->>'branch','') is null or b.branch_id=(f->>'branch')::uuid) and (nullif(f->>'cashbox','') is null or b.id=(f->>'cashbox')::uuid)
 and (nullif(f->>'actor','') is null or x.actor_id=(f->>'actor')::uuid) and (coalesce(f->>'kind','')='' or x.kind=f->>'kind') and private.finance_in_period(t,coalesce(x.occurred_at,x.posted_at),f)
 and position(lower(coalesce(f->>'q','')) in lower(b.name||' '||x.reason||' '||x.actor_name))>0;
$$;
create function private.finance_expense_movements(t uuid,f jsonb,capability text) returns table(branch_id uuid,occurred_at timestamptz,amount numeric)
language sql stable security definer set search_path='' as $$
 select e.branch_id,coalesce(x.occurred_at,x.posted_at),case when x.kind='expense' then e.amount else -e.amount end
 from public.expenses e join public.financial_transactions x on x.tenant_id=e.tenant_id and (x.id=e.transaction_id or x.reversal_of=e.transaction_id)
 where e.tenant_id=t and private.expense_allowed(t,e.id) and private.has_permission(t,capability,e.branch_id)
 and (nullif(f->>'branch','') is null or e.branch_id=(f->>'branch')::uuid) and (nullif(f->>'cashbox','') is null or e.cashbox_id=(f->>'cashbox')::uuid)
 and (nullif(f->>'actor','') is null or x.actor_id=(f->>'actor')::uuid) and (nullif(f->>'category','') is null or e.category_id=(f->>'category')::uuid)
 and private.finance_in_period(t,coalesce(x.occurred_at,x.posted_at),f);
$$;
create function private.finance_report_rows(t uuid,report text,f jsonb,capability text default 'finance.reports.view') returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare customer uuid;zone text;branch uuid;
begin
 perform private.finance_report_check(t,f,capability);select timezone into zone from public.tenants where id=t;
 branch:=nullif(f->>'branch','')::uuid;
 if report='payments' then
  return query select jsonb_build_object('id',p.id,'date',p.paid_at,'branch',b.name,'customer',p.customer_name,'method',p.method,'cashbox',p.cashbox_name,'received',round(p.amount,2)::text,'allocated',round(p.allocated,2)::text,'credit',round(p.credit,2)::text,'refunded',round(p.amount-p.allocated-p.credit,2)::text,'actor',p.actor_name,'reference',p.external_reference)
  from private.payment_rows(t,f) p join public.branches b on b.tenant_id=t and b.id=p.branch_id where private.has_permission(t,capability,p.branch_id);
 elsif report in ('debts','overdue','invoices') then
  return query select jsonb_build_object('id',i.id,'date',i.issue_date::timestamp at time zone zone,'invoice',i.invoice_number,'branch',i.branch_name,'customer',i.customer_name,'due',i.due_date,'status',i.display_status,'invoiced',round(i.total,2)::text,'outstanding',round(i.outstanding,2)::text,'overdue_days',i.overdue_days::text,
   'aging',case when i.overdue_days=0 then 'Not yet due' when i.overdue_days<=7 then '1–7 days' when i.overdue_days<=30 then '8–30 days' when i.overdue_days<=60 then '31–60 days' else 'More than 60 days' end)
  from private.invoice_rows(t,'debts.view',f) i where private.has_permission(t,capability,i.branch_id)
  and (report='invoices' or (i.state='issued' and i.outstanding>0)) and (report<>'overdue' or i.overdue_days>0)
  and private.finance_in_period(t,i.issue_date::timestamp at time zone zone,f);
 elsif report in ('expenses','refunds') then
  return query select jsonb_build_object('id',s.id,'date',s.occurred_at,'branch',b.name,'cashbox',s.cashbox_name,'category',s.category_name,'customer',s.customer_name,'amount',round(s.amount,2)::text,'actor',s.actor_name,'reason',s.reason,'vendor',s.vendor,'status',case when s.reversed then 'Reversed' else 'Posted' end,'payment_id',s.payment_id)
  from private.operation_rows(t,case when report='expenses' then 'expense' else 'refund' end,f) s join public.branches b on b.tenant_id=t and b.id=s.branch_id where private.has_permission(t,capability,s.branch_id);
 elsif report='cashbox_transactions' then
  return query select jsonb_build_object('id',s.id,'date',s.occurred_at,'branch',s.branch_name,'cashbox',s.cashbox_name,'kind',s.kind,'amount',round(s.amount,2)::text,'actor',s.actor_name,'reason',s.reason)
  from private.finance_cash_rows(t,f,capability) s;
 elsif report='cashbox_balances' then
  return query select jsonb_build_object('id',b.id,'branch',coalesce(br.name,'Business-wide'),'cashbox',b.name,'currency',b.currency,'status',case when b.is_active then 'Active' else 'Inactive' end,
  'balance',round(coalesce((select sum(e.amount) from public.financial_ledger_entries e where e.tenant_id=t and e.cashbox_id=b.id),0),2)::text)
  from public.cashboxes b left join public.branches br on br.tenant_id=t and br.id=b.branch_id where b.tenant_id=t and private.cashbox_allowed(t,b.id) and private.has_permission(t,capability,b.branch_id)
  and (branch is null or b.branch_id=branch) and (nullif(f->>'cashbox','') is null or b.id=(f->>'cashbox')::uuid) and position(lower(coalesce(f->>'q','')) in lower(b.name))>0;
 elsif report='branches' then
  return query select jsonb_build_object('id',b.id,'branch',b.name,
   'received',case when private.has_permission(t,'payments.view',b.id) then (select round(coalesce(sum((v->>'received')::numeric),0),2)::text from private.finance_report_rows(t,'payments',f||jsonb_build_object('branch',b.id),capability) v) end,
   'refunds',case when private.has_permission(t,'payments.view',b.id) then (select round(coalesce(sum((v->>'amount')::numeric),0),2)::text from private.finance_report_rows(t,'refunds',f||jsonb_build_object('branch',b.id),capability) v) end,
   'expenses',case when private.has_permission(t,'expenses.view',b.id) then (select round(coalesce(sum(s.amount),0),2)::text from private.finance_expense_movements(t,f||jsonb_build_object('branch',b.id),capability) s) end,
   'outstanding',case when private.has_permission(t,'debts.view',b.id) and private.has_permission(t,'invoices.view',b.id) then (select round(coalesce(sum((v->>'outstanding')::numeric),0),2)::text from private.finance_report_rows(t,'debts',(f-'from'-'to')||jsonb_build_object('branch',b.id),capability) v) end,
   'net_cash_movement',case when private.has_permission(t,'cashboxes.view',b.id) then (select round(coalesce(sum(s.amount),0),2)::text from private.finance_cash_rows(t,f||jsonb_build_object('branch',b.id),capability) s) end)
  from public.branches b where b.tenant_id=t and private.has_permission(t,capability,b.id) and (branch is null or b.id=branch);
 elsif report='customer_statement' then
  customer:=nullif(f->>'customer','')::uuid;
  if customer is null or not private.customer_allowed(t,customer,'customers.view') then raise exception using errcode='42501',message='Choose an authorized customer for the statement';end if;
  -- Independent document/debt and cash columns prevent counting allocations as receipts.
  return query select jsonb_build_object('id',e.id,'date',a.created_at,'branch',i.branch_name,'document',i.invoice_number,'kind',e.kind,'debt_change',round(e.amount,2)::text,'cash_received','0.00','cash_refunded','0.00','actor',a.actor_name,'reason',a.reason)
  from public.invoice_receivable_entries e join public.invoices i on i.tenant_id=e.tenant_id and i.id=e.invoice_id join public.financial_audit_events a on a.id=e.audit_event_id
  where e.tenant_id=t and i.customer_id=customer and private.invoice_allowed(t,i.id,'debts.view') and private.has_permission(t,capability,i.branch_id)
  and (branch is null or i.branch_id=branch) and (nullif(f->>'actor','') is null or a.actor_id=(f->>'actor')::uuid) and private.finance_in_period(t,a.created_at,f)
  union all
  select jsonb_build_object('id',p.id,'date',p.paid_at,'branch',b.name,'document',p.external_reference,'kind','payment','debt_change','0.00','cash_received',round(p.amount,2)::text,'cash_refunded','0.00','actor',p.actor_name,'reason','Customer payment')
  from private.payment_rows(t,f) p join public.branches b on b.tenant_id=t and b.id=p.branch_id where private.has_permission(t,capability,p.branch_id)
  union all
  select jsonb_build_object('id',r.id,'date',r.occurred_at,'branch',b.name,'document','Refund','kind','refund','debt_change','0.00','cash_received','0.00','cash_refunded',round(r.amount,2)::text,'actor',r.actor_name,'reason',r.reason)
  from private.operation_rows(t,'refund',f) r join public.branches b on b.tenant_id=t and b.id=r.branch_id where private.has_permission(t,capability,r.branch_id);
 elsif report='audit' then
  return query select jsonb_build_object('id',a.id,'date',a.created_at,'branch',coalesce(br.name,'Business-wide'),'operation',a.operation,'record',coalesce(i.invoice_number,b.name),'actor',a.actor_name,'reason',a.reason)
  from public.financial_audit_events a left join public.invoices i on i.tenant_id=t and i.id=a.invoice_id left join public.cashboxes b on b.tenant_id=t and b.id=a.cashbox_id
  left join public.branches br on br.tenant_id=t and br.id=coalesce(i.branch_id,b.branch_id)
  where a.tenant_id=t and private.has_permission(t,capability,coalesce(i.branch_id,b.branch_id)) and private.has_permission(t,'finance.audit.view',coalesce(i.branch_id,b.branch_id))
  and ((a.invoice_id is not null and private.invoice_allowed(t,i.id)) or (a.cashbox_id is not null and private.cashbox_allowed(t,b.id) and (a.transaction_id is null or private.financial_transaction_allowed(t,a.transaction_id))))
  and (branch is null or coalesce(i.branch_id,b.branch_id)=branch) and (nullif(f->>'actor','') is null or a.actor_id=(f->>'actor')::uuid)
  and (nullif(f->>'cashbox','') is null or a.cashbox_id=(f->>'cashbox')::uuid) and (nullif(f->>'customer','') is null or i.customer_id=(f->>'customer')::uuid)
  and (coalesce(f->>'kind','')='' or a.operation=f->>'kind') and private.finance_in_period(t,a.created_at,f)
  union all select jsonb_build_object('id',a.id,'date',a.created_at,'branch','Business-wide','operation','expense_category_updated','record',a.after_data->>'name','actor',a.actor_name,'reason','Expense category configuration')
  from public.financial_configuration_events a where a.tenant_id=t and branch is null and private.has_permission(t,capability) and private.has_permission(t,'finance.audit.view')
  and (nullif(f->>'actor','') is null or a.actor_id=(f->>'actor')::uuid) and private.finance_in_period(t,a.created_at,f)
  and coalesce(f->>'cashbox','')='' and coalesce(f->>'customer','')='' and coalesce(f->>'kind','')='';
 else raise exception 'Unknown financial report';end if;
end $$;
create function public.financial_report(p_tenant uuid,p_report text,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid report page';end if;
 with rows as materialized(select v from private.finance_report_rows(p_tenant,p_report,p_filters) v),page as(select v from rows order by v->>'date' desc nulls last,v->>'id' limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(v order by v->>'date' desc nulls last,v->>'id') from page),'[]')) into result;return result;
end $$;
revoke all on function private.finance_report_check(uuid,jsonb,text),private.finance_in_period(uuid,timestamptz,jsonb),private.finance_cash_rows(uuid,jsonb,text),private.finance_expense_movements(uuid,jsonb,text),private.finance_report_rows(uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.financial_report(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.financial_report(uuid,text,jsonb,integer) to authenticated;
