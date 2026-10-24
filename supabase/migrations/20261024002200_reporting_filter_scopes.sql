-- Apply customer/method/category to their relevant cash sources, including reversals.
do $$ declare definition text;begin
 select pg_get_functiondef('private.finance_cash_rows(uuid,jsonb,text)'::regprocedure) into definition;
 definition:=replace(definition,'and position(lower(coalesce(f->>''q'',''''))',
 'and (nullif(f->>''customer'','''') is null or exists(select 1 from public.payments p where p.tenant_id=t and p.transaction_id=x.id and p.customer_id=(f->>''customer'')::uuid) or exists(select 1 from public.payment_refunds r join public.payments p on p.tenant_id=r.tenant_id and p.id=r.payment_id where r.tenant_id=t and r.transaction_id=x.id and p.customer_id=(f->>''customer'')::uuid))
 and (coalesce(f->>''method'','''')='''' or exists(select 1 from public.payments p where p.tenant_id=t and p.transaction_id=x.id and p.method=f->>''method'') or exists(select 1 from public.payment_refunds r join public.payments p on p.tenant_id=r.tenant_id and p.id=r.payment_id where r.tenant_id=t and r.transaction_id=x.id and p.method=f->>''method''))
 and (nullif(f->>''category'','''') is null or exists(select 1 from public.expenses s where s.tenant_id=t and (s.transaction_id=x.id or s.transaction_id=x.reversal_of) and s.category_id=(f->>''category'')::uuid))
 and position(lower(coalesce(f->>''q'',''''))');execute definition;
 select pg_get_functiondef('private.operation_rows(uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'where kind_filter=''refund'' and r.tenant_id=t','where kind_filter=''refund'' and (coalesce(filters->>''method'','''')='''' or p.method=filters->>''method'') and r.tenant_id=t');execute definition;
 select pg_get_functiondef('private.finance_report_rows(uuid,text,jsonb,text)'::regprocedure) into definition;
 definition:=replace(definition,'and private.finance_in_period(t,i.issue_date::timestamp at time zone zone,f)',
 'and (nullif(f->>''actor'','''') is null or exists(select 1 from public.invoices h where h.tenant_id=t and h.id=i.id and h.created_by=(f->>''actor'')::uuid)) and private.finance_in_period(t,i.issue_date::timestamp at time zone zone,f)');execute definition;
 select pg_get_functiondef('public.financial_dashboard(uuid,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'jsonb_agg(to_jsonb(trends) order by trend_date)',
 'jsonb_agg(to_jsonb(trends)||jsonb_build_object(''received'',case when can_pay then trends.received end,''refunds'',case when can_pay then trends.refunds end,''expenses'',case when can_expense then trends.expenses end) order by trend_date)');execute definition;
end $$;
