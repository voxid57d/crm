-- 6C: payments post cash; allocations alone affect receivables. Preserve history.
insert into public.permissions(key,description) values('payments.allocate','Allocate/release payment credit against authorized invoices');
create function private.seed_payment_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin') and p.key='payments.allocate') or
 (r.system_key in ('manager','cashier') and p.key in ('payments.view','payments.create','payments.allocate'))) on conflict do nothing;return new;
end $$;
revoke all on function private.seed_payment_permissions() from public,anon,authenticated;
create trigger zzzzzz_seed_payments after insert on public.tenants for each row execute function private.seed_payment_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
(r.system_key in ('owner','admin') and p.key='payments.allocate') or
(r.system_key in ('manager','cashier') and p.key in ('payments.view','payments.create','payments.allocate')) on conflict do nothing;
alter table public.financial_transactions add column occurred_at timestamptz;
alter table public.financial_transactions drop constraint financial_transactions_kind_check;
alter table public.financial_transactions add constraint financial_transactions_kind_check check(kind in ('opening_balance','adjustment','payment'));
alter table public.financial_audit_events drop constraint financial_audit_events_operation_check;
alter table public.financial_audit_events add constraint financial_audit_events_operation_check check(operation in
 ('cashbox_created','cashbox_updated','opening_balance','adjustment','invoice_created','invoice_updated','invoice_issued','invoice_voided','invoice_discarded','payment','invoice_allocated','invoice_allocation_released'));
alter table public.financial_audit_events drop constraint financial_audit_events_check;
alter table public.financial_audit_events add constraint financial_audit_events_check check((operation in ('opening_balance','adjustment','payment'))=(transaction_id is not null));
create table public.payments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,branch_id uuid not null,customer_id uuid not null,cashbox_id uuid not null,
 transaction_id uuid not null,currency text not null,amount numeric not null check(amount>0 and amount=trunc(amount,2) and amount<=9999999999999999.99),
 method text not null check(method in ('cash','bank_transfer','card_terminal','other')),paid_at timestamptz not null,
 external_reference text not null default '' check(length(external_reference)<=150),notes text not null default '' check(length(notes)<=2000),
 customer_name text not null,created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,transaction_id),unique(tenant_id,id,customer_id,currency),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id),foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 foreign key(tenant_id,cashbox_id,currency) references public.cashboxes(tenant_id,id,currency),foreign key(tenant_id,transaction_id) references public.financial_transactions(tenant_id,id)
);
create index payments_customer_idx on public.payments(tenant_id,customer_id,paid_at desc,id);
create index payments_cashbox_idx on public.payments(tenant_id,cashbox_id);
create index payments_branch_idx on public.payments(tenant_id,branch_id,paid_at desc,id);
alter table public.invoices add unique(tenant_id,id,customer_id,currency);
create table public.payment_allocations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,payment_id uuid not null,invoice_id uuid not null,customer_id uuid not null,currency text not null,
 amount numeric not null check(amount<>0 and amount=trunc(amount,2) and abs(amount)<=9999999999999999.99),reversal_of uuid,
 audit_event_id uuid not null unique,created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,invoice_id),
 foreign key(tenant_id,payment_id,customer_id,currency) references public.payments(tenant_id,id,customer_id,currency),
 foreign key(tenant_id,invoice_id,customer_id,currency) references public.invoices(tenant_id,id,customer_id,currency),
 foreign key(tenant_id,reversal_of) references public.payment_allocations(tenant_id,id),
 foreign key(tenant_id,audit_event_id) references public.financial_audit_events(tenant_id,id),check((amount<0)=(reversal_of is not null)),check(reversal_of is distinct from id)
);
create index payment_allocations_payment_idx on public.payment_allocations(tenant_id,payment_id);
create index payment_allocations_invoice_idx on public.payment_allocations(tenant_id,invoice_id);
create index payment_allocations_reversal_idx on public.payment_allocations(tenant_id,reversal_of) where reversal_of is not null;
alter table public.invoice_receivable_entries add column allocation_id uuid;
alter table public.invoice_receivable_entries add unique(tenant_id,allocation_id);
alter table public.invoice_receivable_entries add foreign key(tenant_id,allocation_id,invoice_id) references public.payment_allocations(tenant_id,id,invoice_id);
alter table public.invoice_receivable_entries drop constraint invoice_receivable_entries_kind_check;
alter table public.invoice_receivable_entries drop constraint invoice_receivable_entries_check;
alter table public.invoice_receivable_entries add constraint invoice_receivable_entries_kind_check check(kind in ('issue','void','allocation','allocation_release'));
alter table public.invoice_receivable_entries add constraint invoice_receivable_entries_check check(
 ((kind in ('issue','allocation_release') and amount>0) or (kind in ('void','allocation') and amount<0)) and
 (kind in ('allocation','allocation_release'))=(allocation_id is not null));
create function private.payment_allowed(t uuid,p uuid,permission text default 'payments.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payments where tenant_id=t and id=p and private.has_permission(t,'payments.view',branch_id)
 and private.has_permission(t,permission,branch_id) and private.cashbox_allowed(t,cashbox_id));
$$;
revoke all on function private.payment_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.payment_allowed(uuid,uuid,text) to authenticated;
alter table public.payments enable row level security;alter table public.payment_allocations enable row level security;
revoke all on public.payments,public.payment_allocations from anon,authenticated;
create policy payments_read on public.payments for select to authenticated using(private.payment_allowed(tenant_id,id));
create policy payment_allocations_read on public.payment_allocations for select to authenticated using(private.payment_allowed(tenant_id,payment_id) and private.invoice_allowed(tenant_id,invoice_id));
create trigger payments_immutable before update or delete on public.payments for each row execute function private.finance_immutable();
create trigger payment_allocations_immutable before update or delete on public.payment_allocations for each row execute function private.finance_immutable();

create function private.assert_payment_consistent(t uuid,p uuid) returns void language plpgsql security definer set search_path='' as $$
declare h public.payments;allocated numeric;
begin
 select * into h from public.payments where tenant_id=t and id=p;
 if not found then raise exception 'Payment missing';end if;
 if not exists(select 1 from public.financial_transactions x join public.financial_ledger_entries e on e.tenant_id=x.tenant_id and e.transaction_id=x.id
 where x.tenant_id=t and x.id=h.transaction_id and x.kind='payment' and e.cashbox_id=h.cashbox_id and e.amount=h.amount and x.currency=h.currency and x.occurred_at=h.paid_at)
 then raise exception 'Payment requires its exact cash posting';end if;
 select coalesce(sum(amount),0) into allocated from public.payment_allocations where tenant_id=t and payment_id=p;
 if allocated<0 or allocated>h.amount then raise exception 'Payment credit exceeded';end if;
 if exists(select 1 from public.payment_allocations a where a.tenant_id=t and a.payment_id=p and (
 not exists(select 1 from public.invoice_receivable_entries e where e.tenant_id=t and e.allocation_id=a.id and e.invoice_id=a.invoice_id and e.amount=-a.amount and e.audit_event_id=a.audit_event_id)
 or not exists(select 1 from public.financial_audit_events e where e.tenant_id=t and e.id=a.audit_event_id and e.invoice_id=a.invoice_id and e.operation=case when a.amount>0 then 'invoice_allocated' else 'invoice_allocation_released' end)
 or (a.amount<0 and not exists(select 1 from public.payment_allocations original where original.tenant_id=t and original.id=a.reversal_of and original.amount>0 and original.payment_id=p and original.invoice_id=a.invoice_id))
 or (a.amount>0 and a.amount+coalesce((select sum(r.amount) from public.payment_allocations r where r.tenant_id=t and r.reversal_of=a.id),0)<0)))
 then raise exception 'Invalid allocation or release history';end if;
end $$;
create function private.payment_consistency_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='payments' then perform private.assert_payment_consistent(new.tenant_id,new.id);
 else perform private.assert_payment_consistent(new.tenant_id,new.payment_id);end if;return null;
end $$;
create constraint trigger payments_consistent after insert on public.payments deferrable initially deferred for each row execute function private.payment_consistency_trigger();
create constraint trigger allocations_consistent after insert on public.payment_allocations deferrable initially deferred for each row execute function private.payment_consistency_trigger();
revoke all on function private.assert_payment_consistent(uuid,uuid),private.payment_consistency_trigger() from public,anon,authenticated;
