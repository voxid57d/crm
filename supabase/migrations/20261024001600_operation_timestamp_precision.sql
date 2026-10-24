-- User-entered financial timestamps have second precision. A correction made
-- in the original posting's second is permitted without inventing a future time.
do $$ declare definition text; begin
 select pg_get_functiondef('public.reverse_financial_transaction(uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'at_time<coalesce(original.occurred_at,original.posted_at)','at_time<date_trunc(''second'',coalesce(original.occurred_at,original.posted_at))');execute definition;
 select pg_get_functiondef('public.post_payment_refund(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'at_time<p.paid_at','at_time<date_trunc(''second'',p.paid_at)');execute definition;
end $$;
