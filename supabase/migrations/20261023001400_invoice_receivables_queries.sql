create function private.invoice_rows(t uuid,permission text,filters jsonb default '{}')
returns table(id uuid,branch_id uuid,customer_id uuid,currency text,state text,status text,invoice_number text,issue_date date,due_date date,
 created_at timestamptz,version integer,customer_name text,branch_name text,total numeric,outstanding numeric,days_overdue integer)
language plpgsql stable security definer set search_path='' as $$
declare filter_branch uuid;filter_customer uuid;filter_status text:=coalesce(filters->>'status','');today date;
begin
 if not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Invoice access denied';end if;
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
 from public.invoices h where h.tenant_id=t and private.invoice_allowed(t,h.id,permission)
 and (filter_branch is null or h.branch_id=filter_branch) and (filter_customer is null or h.customer_id=filter_customer)
 and position(lower(coalesce(filters->>'q','')) in lower(coalesce(h.invoice_number,'Draft')||' '||coalesce(h.bill_to->>'name','')))>0
 ), rows as(select base.*,case when base.state='issued' and base.outstanding>0 and base.due_date<today then 'overdue' else base.state end display_status,
 case when base.state='issued' and base.outstanding>0 then greatest(today-base.due_date,0) else 0 end overdue_days from base)
 select rows.id,rows.branch_id,rows.customer_id,rows.currency,rows.state,rows.display_status,rows.invoice_number,rows.issue_date,rows.due_date,rows.created_at,rows.version,
 rows.customer_name,rows.branch_name,rows.total,rows.outstanding,rows.overdue_days from rows where filter_status='' or rows.display_status=filter_status;
end $$;
create function private.invoice_summary(t uuid,filters jsonb default '{}') returns jsonb language sql stable security definer set search_path='' as $$
 with visible as materialized(select * from private.invoice_rows(t,'debts.view',filters)),
 entries as(select e.* from public.invoice_receivable_entries e join visible v on v.id=e.invoice_id where e.tenant_id=t)
 select jsonb_build_object('currency','UZS','issued_charges',round(coalesce((select sum(amount) from entries where kind='issue'),0),2)::text,
 'voided_charges',round(-coalesce((select sum(amount) from entries where kind='void'),0),2)::text,
 'outstanding',round(coalesce(sum(outstanding) filter(where state='issued'),0),2)::text,
 'overdue',round(coalesce(sum(outstanding) filter(where status='overdue'),0),2)::text,
 'not_due',round(coalesce(sum(outstanding) filter(where state='issued' and days_overdue=0),0),2)::text,
 'days_1_7',round(coalesce(sum(outstanding) filter(where days_overdue between 1 and 7),0),2)::text,
 'days_8_30',round(coalesce(sum(outstanding) filter(where days_overdue between 8 and 30),0),2)::text,
 'days_31_60',round(coalesce(sum(outstanding) filter(where days_overdue between 31 and 60),0),2)::text,
 'days_over_60',round(coalesce(sum(outstanding) filter(where days_overdue>60),0),2)::text,
 'next_due_date',min(due_date) filter(where state='issued' and outstanding>0),
 'outstanding_invoices',count(*) filter(where state='issued' and outstanding>0)) from visible;
$$;
create function public.invoice_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;sorting text:=coalesce(p_filters->>'sort','newest');
begin
 if p_page is null or p_page not between 0 and 100000 or sorting not in ('newest','due','total') then raise exception 'Invalid invoice page/sort';end if;
 with filtered as materialized(select * from private.invoice_rows(p_tenant,'invoices.view',p_filters)),
 page as(select *,row_number() over(order by case when sorting='due' then due_date end,case when sorting='total' then total end desc,created_at desc,id) rank
 from filtered order by rank limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg((to_jsonb(page)-array['rank','total','outstanding'])||
 jsonb_build_object('total',round(total,2)::text,'outstanding',round(outstanding,2)::text) order by rank) from page),'[]')) into result;
 return result;
end $$;
create function public.invoice_details(p_tenant uuid,p_invoice uuid,p_audit_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.invoice_allowed(p_tenant,p_invoice) then raise exception using errcode='42501',message='Invoice access denied';end if;
 if p_audit_page is null or p_audit_page not between 0 and 100000 then raise exception 'Invalid audit page';end if;
 with visible as(select * from private.invoice_rows(p_tenant,'invoices.view') where id=p_invoice),
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
create function public.invoice_customer_choices(p_tenant uuid,p_branch uuid,p_search text default '') returns table(id uuid,name text,phone text)
language sql stable security definer set search_path='' as $$
 select c.id,trim(c.first_name||' '||c.last_name),c.phone from public.customers c
 where c.tenant_id=p_tenant and c.archived_at is null and length(p_search)<=100
 and private.has_permission(p_tenant,'invoices.view',p_branch) and private.has_permission(p_tenant,'invoices.create',p_branch)
 and private.customer_allowed(p_tenant,c.id,'customers.view') and exists(select 1 from public.customer_branches b where b.tenant_id=p_tenant and b.customer_id=c.id and b.branch_id=p_branch)
 and position(lower(p_search) in lower(c.first_name||' '||c.last_name||' '||c.phone))>0 order by c.first_name,c.last_name,c.id limit 20;
$$;
create function public.debt_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid debt page';end if;
 with visible as materialized(select * from private.invoice_rows(p_tenant,'debts.view',p_filters) where state='issued' and outstanding>0),
 grouped as(select customer_id,currency,sum(outstanding) outstanding,sum(case when days_overdue>0 then outstanding else 0 end) overdue,
 min(due_date) next_due_date,count(*) invoice_count,(array_agg(customer_name order by created_at desc,id))[1] customer_name
 from visible group by customer_id,currency),
 page as(select * from grouped order by outstanding desc,customer_id limit 20 offset p_page*20)
 select jsonb_build_object('summary',private.invoice_summary(p_tenant,p_filters),'total',(select count(*) from grouped),
 'rows',coalesce((select jsonb_agg((to_jsonb(page)-array['outstanding','overdue'])||jsonb_build_object('outstanding',round(outstanding,2)::text,'overdue',round(overdue,2)::text,
 'customer_visible',private.customer_allowed(p_tenant,customer_id,'customers.view')) order by outstanding desc,customer_id) from page),'[]')) into result;
 return result;
end $$;
create function public.customer_financial_profile(p_tenant uuid,p_customer uuid,p_branch uuid default null,p_page integer default 0) returns jsonb
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
revoke all on function private.invoice_rows(uuid,text,jsonb),private.invoice_summary(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.invoice_directory(uuid,jsonb,integer),public.invoice_details(uuid,uuid,integer),public.invoice_customer_choices(uuid,uuid,text),public.debt_directory(uuid,jsonb,integer),public.customer_financial_profile(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.invoice_directory(uuid,jsonb,integer),public.invoice_details(uuid,uuid,integer),public.invoice_customer_choices(uuid,uuid,text),public.debt_directory(uuid,jsonb,integer),public.customer_financial_profile(uuid,uuid,uuid,integer) to authenticated;
