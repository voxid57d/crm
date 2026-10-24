create or replace function private.invoice_rows(t uuid,permission text,filters jsonb default '{}')
returns table(id uuid,branch_id uuid,customer_id uuid,currency text,state text,status text,invoice_number text,issue_date date,due_date date,
 created_at timestamptz,version integer,customer_name text,branch_name text,total numeric,outstanding numeric,days_overdue integer)
language plpgsql stable security definer set search_path='' as $$
declare filter_branch uuid;filter_customer uuid;filter_invoice uuid;filter_status text:=coalesce(filters->>'status','');today date;
begin
 if not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Invoice access denied';end if;
 filter_invoice:=nullif(filters->>'invoice','')::uuid;
 filter_branch:=nullif(filters->>'branch','')::uuid;filter_customer:=nullif(filters->>'customer','')::uuid;
 if filter_branch is not null and (not private.has_permission(t,'invoices.view',filter_branch) or not private.has_permission(t,permission,filter_branch))
 then raise exception using errcode='42501',message='Invoice branch access denied';end if;
 if filter_status not in ('','draft','issued','overdue','voided','discarded','paid','partially_paid') or length(coalesce(filters->>'q',''))>100 then raise exception 'Invalid invoice filters';end if;
 select (now() at time zone timezone)::date into today from public.tenants where public.tenants.id=t;
 return query with base as (
 select h.id,h.branch_id,h.customer_id,h.currency,h.state,h.invoice_number,h.issue_date,h.due_date,h.created_at,h.version,
 h.bill_to->>'name' customer_name,h.branch_name,
 (select coalesce(sum(item.line_total),0) from public.invoice_items item where item.tenant_id=t and item.invoice_id=h.id)-h.discount_amount total,
 (select coalesce(sum(entry.amount),0) from public.invoice_receivable_entries entry where entry.tenant_id=t and entry.invoice_id=h.id) outstanding
 from public.invoices h where h.tenant_id=t and (filter_invoice is null or h.id=filter_invoice) and private.invoice_allowed(t,h.id,permission)
 and (filter_branch is null or h.branch_id=filter_branch) and (filter_customer is null or h.customer_id=filter_customer)
 and position(lower(coalesce(filters->>'q','')) in lower(coalesce(h.invoice_number,'Draft')||' '||coalesce(h.bill_to->>'name','')))>0
 ), rows as(select base.*,case when base.state='issued' and base.outstanding=0 then 'paid' when base.state='issued' and base.outstanding>0 and base.due_date<today then 'overdue' when base.state='issued' and base.outstanding<base.total then 'partially_paid' else base.state end display_status,
 case when base.state='issued' and base.outstanding>0 then greatest(today-base.due_date,0) else 0 end overdue_days from base)
 select rows.id,rows.branch_id,rows.customer_id,rows.currency,rows.state,rows.display_status,rows.invoice_number,rows.issue_date,rows.due_date,rows.created_at,rows.version,
 rows.customer_name,rows.branch_name,rows.total,rows.outstanding,rows.overdue_days from rows where filter_status='' or rows.display_status=filter_status;
end $$;
create or replace function public.customer_financial_profile(p_tenant uuid,p_customer uuid,p_branch uuid default null,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare invoices jsonb;summary jsonb;filters jsonb;
begin
 invoices:=private.customer_invoice_profile(p_tenant,p_customer,p_branch,p_page);
 filters:=jsonb_build_object('customer',p_customer,'branch',p_branch);
 select jsonb_build_object('received',round(coalesce(sum(amount),0),2)::text,'allocated',round(coalesce(sum(allocated),0),2)::text,'credit',round(coalesce(sum(credit),0),2)::text) into summary from private.payment_rows(p_tenant,filters);
 return invoices||jsonb_build_object('payments',public.payment_directory(p_tenant,filters,p_page),'payment_summary',summary,
 'can_view_payments',private.has_permission(p_tenant,'payments.view',p_branch) or exists(select 1 from public.branches where tenant_id=p_tenant and (p_branch is null or id=p_branch) and private.has_permission(p_tenant,'payments.view',id)));
end $$;

create function private.customer_invoice_profile(p_tenant uuid,p_customer uuid,p_branch uuid default null,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare filters jsonb;result jsonb;
begin
 if not private.customer_allowed(p_tenant,p_customer,'customers.view') then raise exception using errcode='42501',message='Customer financial profile denied';end if;
 if not (private.has_permission(p_tenant,'invoices.view') and private.has_permission(p_tenant,'debts.view')) and not exists(
 select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'invoices.view',id) and private.has_permission(p_tenant,'debts.view',id))
 then raise exception using errcode='42501',message='Customer financial profile denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid customer finance page';end if;
 filters:=jsonb_build_object('customer',p_customer,'branch',p_branch);
 with visible as materialized(select * from private.invoice_rows(p_tenant,'debts.view',filters)),
 page as(select * from visible order by created_at desc,id limit 20 offset p_page*20)
 select jsonb_build_object('summary',private.invoice_summary(p_tenant,filters),'total',(select count(*) from visible),
 'rows',coalesce((select jsonb_agg((to_jsonb(page)-array['total','outstanding'])||jsonb_build_object('total',round(total,2)::text,'outstanding',round(outstanding,2)::text) order by created_at desc,id) from page),'[]')) into result;
 return result;
end $$;
revoke all on function private.customer_invoice_profile(uuid,uuid,uuid,integer) from public,anon,authenticated;
