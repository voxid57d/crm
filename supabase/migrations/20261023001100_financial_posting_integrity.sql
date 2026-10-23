-- Also check new legs attached to an already committed envelope. A constraint
-- on envelope INSERT alone cannot detect a faulty future RPC appending a leg.
create function private.finance_leg_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.financial_ledger_entries where tenant_id=new.tenant_id and transaction_id=new.transaction_id)<>1
 or not exists(select 1 from public.financial_audit_events a where a.tenant_id=new.tenant_id and a.transaction_id=new.transaction_id
 and a.cashbox_id=new.cashbox_id and a.operation=new.kind)
 then raise exception using errcode='23514',message='Incomplete financial posting';end if;
 return new;
end $$;
create constraint trigger finance_leg_complete after insert on public.financial_ledger_entries deferrable initially deferred
for each row execute function private.finance_leg_complete();
revoke all on function private.finance_leg_complete() from public,anon,authenticated;
