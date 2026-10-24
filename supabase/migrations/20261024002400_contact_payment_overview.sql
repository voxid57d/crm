-- Payment-only profile readers reuse existing authorized payment/credit queries.
create function public.customer_payment_profile(p_tenant uuid,p_customer uuid,p_branch uuid default null,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare filters jsonb;summary jsonb;
begin
 if not private.customer_allowed(p_tenant,p_customer,'customers.view') or
 (not private.has_permission(p_tenant,'payments.view',p_branch) and not exists(select 1 from public.branches where tenant_id=p_tenant and (p_branch is null or id=p_branch) and private.has_permission(p_tenant,'payments.view',id)))
 then raise exception using errcode='42501',message='Contact payment history denied';end if;
 filters:=jsonb_build_object('customer',p_customer,'branch',p_branch);
 select jsonb_build_object('received',round(coalesce(sum(amount),0),2)::text,'allocated',round(coalesce(sum(allocated),0),2)::text,'credit',round(coalesce(sum(credit),0),2)::text) into summary from private.payment_rows(p_tenant,filters);
 return jsonb_build_object('can_view_payments',true,'payment_summary',summary,'payments',public.payment_directory(p_tenant,filters,p_page));
end $$;
revoke all on function public.customer_payment_profile(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.customer_payment_profile(uuid,uuid,uuid,integer) to authenticated;
