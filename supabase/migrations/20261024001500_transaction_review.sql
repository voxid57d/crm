create function public.financial_transaction_details(p_tenant uuid,p_transaction uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.financial_transaction_allowed(p_tenant,p_transaction) then raise exception using errcode='42501',message='Transaction access denied';end if;
 select jsonb_build_object('id',x.id,'kind',x.kind,'reason',x.reason,'actor_name',x.actor_name,'occurred_at',coalesce(x.occurred_at,x.posted_at),'posted_at',x.posted_at,'reversal_of',x.reversal_of,
 'reversed',exists(select 1 from public.financial_transactions r where r.tenant_id=p_tenant and r.reversal_of=x.id),
 'cashboxes',(select jsonb_agg(jsonb_build_object('id',b.id,'branch_id',b.branch_id,'name',b.name,'amount',round(e.amount,2)::text) order by b.id)
 from public.financial_ledger_entries e join public.cashboxes b on b.tenant_id=e.tenant_id and b.id=e.cashbox_id where e.tenant_id=p_tenant and e.transaction_id=x.id)) into result
 from public.financial_transactions x where x.tenant_id=p_tenant and x.id=p_transaction;return result;
end $$;
revoke all on function public.financial_transaction_details(uuid,uuid) from public,anon;
grant execute on function public.financial_transaction_details(uuid,uuid) to authenticated;
