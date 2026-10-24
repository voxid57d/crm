create or replace function private.finance_entry_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;balance numeric;
begin
 select * into b from public.cashboxes where tenant_id=new.tenant_id and id=new.cashbox_id for update;
 if not found or not b.is_active or (b.branch_id is not null and not exists(select 1 from public.branches where tenant_id=b.tenant_id and id=b.branch_id and is_active))
 then raise exception 'Posting requires an active cashbox and branch';end if;
 if new.kind='opening_balance' and exists(select 1 from public.financial_ledger_entries where tenant_id=b.tenant_id and cashbox_id=b.id)
 then raise exception 'Opening balance must be the first posting';end if;
 select coalesce(sum(amount),0) into balance from public.financial_ledger_entries where tenant_id=b.tenant_id and cashbox_id=b.id;
 if not b.allow_negative and balance+new.amount<0 then raise exception 'Insufficient cashbox balance';end if;return new;
end $$;
create function private.assert_financial_transaction(t uuid,identifier uuid) returns void language plpgsql security definer set search_path='' as $$
declare x public.financial_transactions;original public.financial_transactions;legs integer;expected integer:=1;
begin
 select * into x from public.financial_transactions where tenant_id=t and id=identifier;
 if not found then raise exception 'Financial transaction missing';end if;
 if x.kind='transfer' then expected:=2;end if;
 if x.kind='reversal' then
  select * into original from public.financial_transactions where tenant_id=t and id=x.reversal_of;
  if not found or original.kind not in ('opening_balance','adjustment','expense','transfer') or original.currency<>x.currency then raise exception 'Unsupported reversal';end if;
  expected:=case when original.kind='transfer' then 2 else 1 end;
  if exists(select 1 from public.financial_ledger_entries e where e.tenant_id=t and e.transaction_id=original.id
   and not exists(select 1 from public.financial_ledger_entries r where r.tenant_id=t and r.transaction_id=x.id and r.cashbox_id=e.cashbox_id and r.amount=-e.amount))
  then raise exception 'Reversal must exactly offset its original posting';end if;
 end if;
 select count(*) into legs from public.financial_ledger_entries where tenant_id=t and transaction_id=identifier;
 if legs<>expected or (select count(*) from public.financial_audit_events a join public.financial_ledger_entries e
 on e.tenant_id=a.tenant_id and e.transaction_id=a.transaction_id and e.cashbox_id=a.cashbox_id
 where a.tenant_id=t and a.transaction_id=identifier and a.operation=x.kind)<>1
 then raise exception using errcode='23514',message='Incomplete financial posting';end if;
 if x.kind='payment' and not exists(select 1 from public.payments where tenant_id=t and transaction_id=x.id) then raise exception 'Payment source missing';end if;
 if x.kind='expense' and not exists(select 1 from public.expenses s join public.financial_ledger_entries e on e.tenant_id=s.tenant_id and e.transaction_id=s.transaction_id
 where s.tenant_id=t and s.transaction_id=x.id and e.cashbox_id=s.cashbox_id and e.amount=-s.amount and s.currency=x.currency and s.occurred_at=x.occurred_at)
 then raise exception 'Expense source and posting must match';end if;
 if x.kind='refund' and not exists(select 1 from public.payment_refunds s join public.financial_ledger_entries e on e.tenant_id=s.tenant_id and e.transaction_id=s.transaction_id
 join public.payments p on p.tenant_id=s.tenant_id and p.id=s.payment_id
 where s.tenant_id=t and s.transaction_id=x.id and e.cashbox_id=s.cashbox_id and e.amount=-s.amount and s.currency=x.currency and p.currency=s.currency and s.occurred_at=x.occurred_at)
 then raise exception 'Refund source and posting must match';end if;
 if x.kind='transfer' and not exists(select 1 from public.cashbox_transfers s where s.tenant_id=t and s.transaction_id=x.id and s.currency=x.currency and s.occurred_at=x.occurred_at
 and exists(select 1 from public.financial_ledger_entries e where e.tenant_id=t and e.transaction_id=x.id and e.cashbox_id=s.source_id and e.amount=-s.amount)
 and exists(select 1 from public.financial_ledger_entries e where e.tenant_id=t and e.transaction_id=x.id and e.cashbox_id=s.destination_id and e.amount=s.amount))
 then raise exception 'Transfer must have exact opposite source and destination legs';end if;
end $$;
create or replace function private.finance_posting_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.assert_financial_transaction(new.tenant_id,new.id);return null;end $$;
create or replace function private.finance_leg_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.assert_financial_transaction(new.tenant_id,new.transaction_id);return null;end $$;
create function private.financial_source_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.assert_financial_transaction(new.tenant_id,new.transaction_id);return null;end $$;
create constraint trigger expense_complete after insert on public.expenses deferrable initially deferred for each row execute function private.financial_source_complete();
create constraint trigger transfer_complete after insert on public.cashbox_transfers deferrable initially deferred for each row execute function private.financial_source_complete();
create constraint trigger refund_complete after insert on public.payment_refunds deferrable initially deferred for each row execute function private.financial_source_complete();
create or replace function private.payment_credit(t uuid,p uuid) returns numeric language sql stable security definer set search_path='' as $$
 select amount-coalesce((select sum(amount) from public.payment_allocations where tenant_id=t and payment_id=p),0)
 -coalesce((select sum(amount) from public.payment_refunds where tenant_id=t and payment_id=p),0) from public.payments where tenant_id=t and id=p;
$$;
-- Keep the existing allocation/source checks; add the tighter net-after-refund cap.
create function private.refund_payment_consistent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_payment_consistent(new.tenant_id,new.payment_id);
 if private.payment_credit(new.tenant_id,new.payment_id)<0 then raise exception 'Refund or allocation exceeds net payment';end if;return null;
end $$;
create constraint trigger refund_payment_consistent after insert on public.payment_refunds deferrable initially deferred for each row execute function private.refund_payment_consistent();
create constraint trigger allocation_net_consistent after insert on public.payment_allocations deferrable initially deferred for each row execute function private.refund_payment_consistent();
revoke all on function private.assert_financial_transaction(uuid,uuid),private.financial_source_complete(),private.refund_payment_consistent() from public,anon,authenticated;
