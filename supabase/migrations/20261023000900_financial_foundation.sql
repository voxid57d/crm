-- Step 6A only: operational cash ledger, not a statutory general ledger.
-- Additive migration. No existing records are removed or rewritten.
insert into public.permissions(key,description) values
 ('cashboxes.adjust','Post opening balances and reasoned cashbox adjustments'),
 ('finance.audit.view','Read financial configuration and posting audit history');

create function private.seed_finance_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p
 where r.tenant_id=new.id and ((r.system_key in ('owner','admin') and p.key in ('cashboxes.adjust','finance.audit.view'))
 or (r.system_key='manager' and p.key in ('cashboxes.view','cashboxes.manage'))) on conflict do nothing;
 return new;
end $$;
revoke all on function private.seed_finance_permissions() from public,anon,authenticated;
create trigger zzzz_seed_finance after insert on public.tenants for each row execute function private.seed_finance_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p
where (r.system_key in ('owner','admin') and p.key in ('cashboxes.adjust','finance.audit.view'))
or (r.system_key='manager' and p.key in ('cashboxes.view','cashboxes.manage')) on conflict do nothing;

-- Currency is part of every money-holding record and composite reference.
-- Only UZS is enabled. Supporting another precision requires a reviewed migration.
create table public.finance_currencies (
 code text primary key check(code ~ '^[A-Z]{3}$'),
 minor_units smallint not null check(minor_units=2)
);
insert into public.finance_currencies values('UZS',2);
create table public.cashboxes (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),branch_id uuid,
 name text not null check(length(trim(name)) between 1 and 100),
 cashbox_type text not null check(cashbox_type in ('cash','bank','other')),
 currency text not null default 'UZS' references public.finance_currencies(code),is_active boolean not null default true,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 creation_key uuid not null,creation_payload jsonb not null,
 unique(tenant_id,id),unique(tenant_id,id,currency),unique(tenant_id,creation_key),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id)
);
create index cashboxes_directory_idx on public.cashboxes(tenant_id,branch_id,is_active,name,id);
create index cashboxes_creator_idx on public.cashboxes(created_by);

-- A transaction is an immutable posting envelope. Future payments/expenses and
-- transfers will reference this envelope, rather than maintaining balance columns.
create table public.financial_transactions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 kind text not null check(kind in ('opening_balance','adjustment')),
 currency text not null references public.finance_currencies(code),
 idempotency_key uuid not null,request_payload jsonb not null,
 reason text not null check(length(trim(reason)) between 3 and 1000),
 actor_id uuid not null references auth.users(id),actor_name text not null,employee_id uuid,
 posted_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,kind,currency),unique(tenant_id,idempotency_key),
 foreign key(tenant_id,employee_id) references public.employees(tenant_id,id)
);
create index financial_transactions_actor_idx on public.financial_transactions(tenant_id,actor_id,posted_at desc);
create index financial_transactions_employee_idx on public.financial_transactions(tenant_id,employee_id);
create table public.financial_ledger_entries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,transaction_id uuid not null,cashbox_id uuid not null,
 kind text not null,currency text not null,
 -- No NUMERIC typmod: reject excess precision instead of silently rounding it
 -- before a CHECK sees the original value. Equivalent magnitude to NUMERIC(18,2).
 amount numeric not null check(amount<>0 and amount=trunc(amount,2) and abs(amount)<=9999999999999999.99),
 unique(tenant_id,transaction_id,cashbox_id),
 foreign key(tenant_id,transaction_id,kind,currency) references public.financial_transactions(tenant_id,id,kind,currency),
 foreign key(tenant_id,cashbox_id,currency) references public.cashboxes(tenant_id,id,currency),
 check(kind<>'opening_balance' or amount>0)
);
create unique index financial_one_opening_idx on public.financial_ledger_entries(tenant_id,cashbox_id) where kind='opening_balance';
create index financial_ledger_cashbox_idx on public.financial_ledger_entries(tenant_id,cashbox_id,transaction_id);
create table public.financial_audit_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,cashbox_id uuid not null,transaction_id uuid,
 operation text not null check(operation in ('cashbox_created','cashbox_updated','opening_balance','adjustment')),
 actor_id uuid not null references auth.users(id),actor_name text not null,
 reason text not null default '' check(length(reason)<=1000),before_data jsonb,after_data jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,cashbox_id) references public.cashboxes(tenant_id,id),
 foreign key(tenant_id,transaction_id) references public.financial_transactions(tenant_id,id),
 check((operation in ('opening_balance','adjustment'))=(transaction_id is not null))
);
create index financial_audit_cashbox_idx on public.financial_audit_events(tenant_id,cashbox_id,created_at desc,id);
create unique index financial_audit_transaction_idx on public.financial_audit_events(tenant_id,transaction_id) where transaction_id is not null;
create index financial_audit_actor_idx on public.financial_audit_events(actor_id);

create function private.cashbox_allowed(t uuid,c uuid,p text default 'cashboxes.view') returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cashboxes b where b.tenant_id=t and b.id=c
 and private.has_permission(t,'cashboxes.view',b.branch_id) and private.has_permission(t,p,b.branch_id));
$$;
create function private.financial_transaction_allowed(t uuid,x uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.financial_ledger_entries where tenant_id=t and transaction_id=x)
 and not exists(select 1 from public.financial_ledger_entries e where e.tenant_id=t and e.transaction_id=x
 and not private.cashbox_allowed(t,e.cashbox_id));
$$;
revoke all on function private.cashbox_allowed(uuid,uuid,text),private.financial_transaction_allowed(uuid,uuid) from public,anon;
grant execute on function private.cashbox_allowed(uuid,uuid,text),private.financial_transaction_allowed(uuid,uuid) to authenticated;

alter table public.finance_currencies enable row level security;
alter table public.cashboxes enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_ledger_entries enable row level security;
alter table public.financial_audit_events enable row level security;
revoke all on public.finance_currencies,public.cashboxes,public.financial_transactions,public.financial_ledger_entries,public.financial_audit_events from anon,authenticated;
-- Monetary values are exposed only as decimal strings by checked RPCs, avoiding
-- PostgREST JSON numeric -> JavaScript Number conversion of large exact values.
grant select on public.finance_currencies to authenticated;
grant select(id,tenant_id,branch_id,name,cashbox_type,currency,is_active,created_by,created_at,updated_at,version) on public.cashboxes to authenticated;
create policy finance_currencies_read on public.finance_currencies for select to authenticated using(auth.uid() is not null);
create policy cashboxes_read on public.cashboxes for select to authenticated using(private.cashbox_allowed(tenant_id,id));
create policy financial_transactions_read on public.financial_transactions for select to authenticated using(private.financial_transaction_allowed(tenant_id,id));
create policy financial_ledger_read on public.financial_ledger_entries for select to authenticated using(private.cashbox_allowed(tenant_id,cashbox_id));
create policy financial_audit_read on public.financial_audit_events for select to authenticated using(private.cashbox_allowed(tenant_id,cashbox_id,'finance.audit.view'));

create function private.finance_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='Posted financial history is immutable';end $$;
create trigger financial_transactions_immutable before update or delete on public.financial_transactions for each row execute function private.finance_immutable();
create trigger financial_ledger_immutable before update or delete on public.financial_ledger_entries for each row execute function private.finance_immutable();
create trigger financial_audit_immutable before update or delete on public.financial_audit_events for each row execute function private.finance_immutable();
create function private.cashbox_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Cashboxes are retained; deactivate instead';end if;
 if (new.id,new.tenant_id,new.branch_id,new.currency,new.created_by,new.created_at,new.creation_key,new.creation_payload)
 is distinct from (old.id,old.tenant_id,old.branch_id,old.currency,old.created_by,old.created_at,old.creation_key,old.creation_payload)
 then raise exception 'Cashbox scope, currency and creation identity cannot change';end if;
 return new;
end $$;
create trigger cashbox_identity_guard before update or delete on public.cashboxes for each row execute function private.cashbox_identity_guard();
create function private.finance_entry_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;balance numeric;
begin
 select * into b from public.cashboxes where tenant_id=new.tenant_id and id=new.cashbox_id for update;
 if not found or not b.is_active or (b.branch_id is not null and not exists(select 1 from public.branches where tenant_id=b.tenant_id and id=b.branch_id and is_active))
 then raise exception 'Posting requires an active cashbox and branch';end if;
 if new.kind='opening_balance' and exists(select 1 from public.financial_ledger_entries where tenant_id=b.tenant_id and cashbox_id=b.id)
 then raise exception 'Opening balance must be the first posting';end if;
 select coalesce(sum(amount),0) into balance from public.financial_ledger_entries where tenant_id=b.tenant_id and cashbox_id=b.id;
 if balance+new.amount<0 then raise exception 'Insufficient cashbox balance';end if;
 return new;
end $$;
create trigger finance_entry_guard before insert on public.financial_ledger_entries for each row execute function private.finance_entry_guard();
-- Deferred integrity ensures even a future faulty posting RPC cannot commit an
-- empty envelope, multiple 6A legs, or a posting without its audit event.
create function private.finance_posting_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.financial_ledger_entries where tenant_id=new.tenant_id and transaction_id=new.id)<>1
 or (select count(*) from public.financial_audit_events a join public.financial_ledger_entries e
 on e.tenant_id=a.tenant_id and e.transaction_id=a.transaction_id and e.cashbox_id=a.cashbox_id
 where a.tenant_id=new.tenant_id and a.transaction_id=new.id and a.operation=new.kind)<>1
 then raise exception using errcode='23514',message='Incomplete financial posting';end if;
 return new;
end $$;
create constraint trigger finance_posting_complete after insert on public.financial_transactions deferrable initially deferred
for each row execute function private.finance_posting_complete();
revoke all on function private.finance_immutable(),private.cashbox_identity_guard(),private.finance_entry_guard(),private.finance_posting_complete() from public,anon,authenticated;
