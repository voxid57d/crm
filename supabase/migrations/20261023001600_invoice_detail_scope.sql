-- Limit invoice detail totals to the requested document inside the data query.
-- Authorization is unchanged; no records are modified.
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
 if filter_status not in ('','draft','issued','overdue','voided','discarded') or length(coalesce(filters->>'q',''))>100 then raise exception 'Invalid invoice filters';end if;
 select (now() at time zone timezone)::date into today from public.tenants where public.tenants.id=t;
 return query with base as (
 select h.id,h.branch_id,h.customer_id,h.currency,h.state,h.invoice_number,h.issue_date,h.due_date,h.created_at,h.version,
 h.bill_to->>'name' customer_name,h.branch_name,
 (select coalesce(sum(item.line_total),0) from public.invoice_items item where item.tenant_id=t and item.invoice_id=h.id)-h.discount_amount total,
 (select coalesce(sum(entry.amount),0) from public.invoice_receivable_entries entry where entry.tenant_id=t and entry.invoice_id=h.id) outstanding
 from public.invoices h where h.tenant_id=t and (filter_invoice is null or h.id=filter_invoice) and private.invoice_allowed(t,h.id,permission)
 and (filter_branch is null or h.branch_id=filter_branch) and (filter_customer is null or h.customer_id=filter_customer)
 and position(lower(coalesce(filters->>'q','')) in lower(coalesce(h.invoice_number,'Draft')||' '||coalesce(h.bill_to->>'name','')))>0
 ), rows as(select base.*,case when base.state='issued' and base.outstanding>0 and base.due_date<today then 'overdue' else base.state end display_status,
 case when base.state='issued' and base.outstanding>0 then greatest(today-base.due_date,0) else 0 end overdue_days from base)
 select rows.id,rows.branch_id,rows.customer_id,rows.currency,rows.state,rows.display_status,rows.invoice_number,rows.issue_date,rows.due_date,rows.created_at,rows.version,
 rows.customer_name,rows.branch_name,rows.total,rows.outstanding,rows.overdue_days from rows where filter_status='' or rows.display_status=filter_status;
end $$;

create or replace function public.invoice_details(p_tenant uuid,p_invoice uuid,p_audit_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.invoice_allowed(p_tenant,p_invoice) then raise exception using errcode='42501',message='Invoice access denied';end if;
 if p_audit_page is null or p_audit_page not between 0 and 100000 then raise exception 'Invalid audit page';end if;
 with visible as(select * from private.invoice_rows(p_tenant,'invoices.view',jsonb_build_object('invoice',p_invoice))),
 events as materialized(select * from public.financial_audit_events where tenant_id=p_tenant and invoice_id=p_invoice)
 select jsonb_build_object('invoice',private.invoice_content(p_tenant,p_invoice),
 'total',(select round(total,2)::text from visible),'outstanding',(select round(outstanding,2)::text from visible),
 'subtotal',(select round(coalesce(sum(line_total),0),2)::text from public.invoice_items where tenant_id=p_tenant and invoice_id=p_invoice),
 'status',(select status from visible),'audit_total',(select count(*) from events),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'operation',a.operation,'reason',a.reason,'actor_name',a.actor_name,'created_at',a.created_at,
 'before_data',case when private.invoice_allowed(p_tenant,p_invoice,'finance.audit.view') then a.before_data else null end,
 'after_data',case when private.invoice_allowed(p_tenant,p_invoice,'finance.audit.view') then a.after_data else null end) order by a.created_at desc,a.id desc)
 from(select * from events order by created_at desc,id desc limit 20 offset p_audit_page*20) a),'[]'),
 'receivables',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount',round(amount,2)::text,'created_at',created_at) order by created_at,id)
 from public.invoice_receivable_entries where tenant_id=p_tenant and invoice_id=p_invoice),'[]'),
 'customer_visible',private.customer_allowed(p_tenant,(select customer_id from public.invoices where tenant_id=p_tenant and id=p_invoice),'customers.view'),
 'replacements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'invoice_number',invoice_number,'state',state) order by created_at,id)
 from public.invoices where tenant_id=p_tenant and replaces_invoice_id=p_invoice and private.invoice_allowed(p_tenant,id)),'[]')) into result;
 return result;
end $$;
