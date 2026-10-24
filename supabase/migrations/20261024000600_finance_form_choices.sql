create function public.finance_payment_options(p_tenant uuid,p_branch uuid,p_customer uuid default null,p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_permission(p_tenant,'payments.view',p_branch) or not private.has_permission(p_tenant,'payments.create',p_branch)
 then raise exception using errcode='42501',message='Payment form denied';end if;
 with choices as(select id,name,phone from public.payment_customer_choices(p_tenant,p_branch,p_search)
 union select c.id,trim(c.first_name||' '||c.last_name),c.phone from public.customers c where c.tenant_id=p_tenant and c.id=p_customer and c.archived_at is null
 and exists(select 1 from public.customer_branches where tenant_id=p_tenant and customer_id=c.id and branch_id=p_branch))
 select jsonb_build_object('customers',coalesce((select jsonb_agg(to_jsonb(c) order by name,id) from choices c),'[]'),
 'cashboxes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'branch_id',branch_id) order by name,id) from public.cashboxes where tenant_id=p_tenant and is_active
 and (branch_id is null or branch_id=p_branch) and private.cashbox_allowed(p_tenant,id)),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'outstanding',round(i.outstanding,2)::text,'branch_id',i.branch_id) order by i.due_date,i.id)
 from private.invoice_rows(p_tenant,'payments.allocate',jsonb_build_object('customer',p_customer)) i where p_customer is not null and i.state='issued' and i.outstanding>0),'[]')) into result;return result;
end $$;
revoke all on function public.finance_payment_options(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.finance_payment_options(uuid,uuid,uuid,text) to authenticated;
