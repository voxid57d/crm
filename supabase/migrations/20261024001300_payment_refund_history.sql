alter function public.payment_details(uuid,uuid) set schema private;
alter function private.payment_details(uuid,uuid) rename to base_payment_details;
revoke all on function private.base_payment_details(uuid,uuid) from public,anon,authenticated;
create function public.payment_details(p_tenant uuid,p_payment uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;refunded numeric;
begin
 base:=private.base_payment_details(p_tenant,p_payment);
 select coalesce(sum(amount),0) into refunded from public.payment_refunds where tenant_id=p_tenant and payment_id=p_payment;
 return base||jsonb_build_object('refunded',round(refunded,2)::text,'refundable',round((base->'payment'->>'amount')::numeric-refunded,2)::text,'refunds',
 coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount',round(r.amount,2)::text,'occurred_at',r.occurred_at,'cashbox_name',b.name,'actor_name',x.actor_name,'reason',x.reason) order by r.occurred_at desc,r.id)
 from public.payment_refunds r join public.cashboxes b on b.tenant_id=r.tenant_id and b.id=r.cashbox_id join public.financial_transactions x on x.tenant_id=r.tenant_id and x.id=r.transaction_id
 where r.tenant_id=p_tenant and r.payment_id=p_payment and private.cashbox_allowed(p_tenant,r.cashbox_id)),'[]'));
end $$;
revoke all on function public.payment_details(uuid,uuid) from public,anon;
grant execute on function public.payment_details(uuid,uuid) to authenticated;
