-- Step 6B. Additive invoice/receivable records; cash movements remain unchanged.
insert into public.permissions(key,description) values
 ('invoices.view','View financial invoice documents in authorized branches'),
 ('invoices.create','Create, edit and discard invoice drafts'),
 ('invoices.issue','Issue invoice drafts and create receivables'),
 ('invoices.void','Void issued invoices with an audited reason'),
 ('debts.view','View authorized invoice receivables and aging');
create function private.seed_invoice_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin') and p.key in ('invoices.view','invoices.create','invoices.issue','invoices.void','debts.view'))
 or (r.system_key='manager' and p.key in ('invoices.view','invoices.create','invoices.issue','debts.view'))
 or (r.system_key='cashier' and p.key in ('invoices.view','debts.view'))) on conflict do nothing;
 return new;
end $$;
revoke all on function private.seed_invoice_permissions() from public,anon,authenticated;
create trigger zzzzz_seed_invoices after insert on public.tenants for each row execute function private.seed_invoice_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
(r.system_key in ('owner','admin') and p.key in ('invoices.view','invoices.create','invoices.issue','invoices.void','debts.view'))
or (r.system_key='manager' and p.key in ('invoices.view','invoices.create','invoices.issue','debts.view'))
or (r.system_key='cashier' and p.key in ('invoices.view','debts.view')) on conflict do nothing;

create table public.invoice_number_counters (
 tenant_id uuid primary key references public.tenants(id),last_number bigint not null check(last_number>0)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),branch_id uuid not null,customer_id uuid not null,
 currency text not null default 'UZS' references public.finance_currencies(code),
 state text not null default 'draft' check(state in ('draft','issued','voided','discarded')),
 invoice_number text,issue_date date not null,due_date date not null check(due_date>=issue_date),
 discount_amount numeric not null default 0 check(discount_amount>=0 and discount_amount=trunc(discount_amount,2) and discount_amount<=9999999999999999.99),
 notes text not null default '' check(length(notes)<=2000),
 bill_to jsonb not null,issuer jsonb not null,branch_name text not null,
 replaces_invoice_id uuid,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>0),
 issued_at timestamptz,issued_by uuid references auth.users(id),
 voided_at timestamptz,voided_by uuid references auth.users(id),void_reason text,
 discarded_at timestamptz,
 unique(tenant_id,id),unique(tenant_id,id,currency),unique(tenant_id,invoice_number),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 foreign key(tenant_id,replaces_invoice_id) references public.invoices(tenant_id,id),
 check((state in ('issued','voided'))=(invoice_number is not null and issued_at is not null and issued_by is not null)),
 check(state in ('issued','voided') or (invoice_number is null and issued_at is null and issued_by is null)),
 check((state='voided')=(voided_at is not null and voided_by is not null and void_reason is not null and length(trim(void_reason)) between 3 and 1000)),
 check(state='voided' or (voided_at is null and voided_by is null and void_reason is null)),
 check((state='discarded')=(discarded_at is not null)),check(replaces_invoice_id is distinct from id)
);
create index invoices_directory_idx on public.invoices(tenant_id,branch_id,state,created_at desc,id);
create index invoices_customer_idx on public.invoices(tenant_id,customer_id,due_date,id);
create index invoices_replacement_idx on public.invoices(tenant_id,replaces_invoice_id) where replaces_invoice_id is not null;
create index invoices_creator_idx on public.invoices(created_by);
create index invoices_issuer_idx on public.invoices(issued_by);
create index invoices_voider_idx on public.invoices(voided_by);
create table public.invoice_items (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,invoice_id uuid not null,
 position integer not null check(position between 1 and 100),description text not null check(length(trim(description)) between 1 and 500),
 quantity numeric not null check(quantity>0 and quantity=trunc(quantity,4) and quantity<=999999.9999),
 unit_price numeric not null check(unit_price>=0 and unit_price=trunc(unit_price,2) and unit_price<=9999999999999999.99),
 discount_amount numeric not null default 0 check(discount_amount>=0 and discount_amount=trunc(discount_amount,2) and discount_amount<=9999999999999999.99),
 line_total numeric generated always as (round(quantity*unit_price,2)-discount_amount) stored,
 unique(tenant_id,invoice_id,position),foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),
 check(round(quantity*unit_price,2)<=9999999999999999.99),check(line_total>=0 and line_total<=9999999999999999.99)
);
-- Extend the existing financial audit stream rather than creating a second audit system.
alter table public.financial_audit_events alter column cashbox_id drop not null;
alter table public.financial_audit_events add column invoice_id uuid;
alter table public.financial_audit_events add column request_key uuid;
alter table public.financial_audit_events add column request_payload jsonb;
alter table public.financial_audit_events add unique(tenant_id,id);
alter table public.financial_audit_events add foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id);
alter table public.financial_audit_events drop constraint financial_audit_events_operation_check;
alter table public.financial_audit_events add constraint financial_audit_events_operation_check check(operation in
 ('cashbox_created','cashbox_updated','opening_balance','adjustment','invoice_created','invoice_updated','invoice_issued','invoice_voided','invoice_discarded'));
alter table public.financial_audit_events add constraint financial_audit_scope_check check(
 ((cashbox_id is not null)::integer+(invoice_id is not null)::integer)=1 and
 (operation like 'invoice_%')=(invoice_id is not null) and
 (invoice_id is null or (request_key is not null and request_payload is not null)));
create unique index financial_audit_request_idx on public.financial_audit_events(tenant_id,request_key) where request_key is not null;
create index financial_audit_invoice_idx on public.financial_audit_events(tenant_id,invoice_id,created_at desc,id);
create table public.invoice_receivable_entries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,invoice_id uuid not null,currency text not null,
 kind text not null check(kind in ('issue','void')),amount numeric not null check(amount<>0 and amount=trunc(amount,2) and abs(amount)<=9999999999999999.99),
 audit_event_id uuid not null unique,created_at timestamptz not null default now(),
 foreign key(tenant_id,invoice_id,currency) references public.invoices(tenant_id,id,currency),
 foreign key(tenant_id,audit_event_id) references public.financial_audit_events(tenant_id,id),
 check((kind='issue' and amount>0) or (kind='void' and amount<0))
);
create unique index invoice_one_issue_idx on public.invoice_receivable_entries(tenant_id,invoice_id) where kind='issue';
create unique index invoice_one_void_idx on public.invoice_receivable_entries(tenant_id,invoice_id) where kind='void';

create function private.invoice_allowed(t uuid,i uuid,p text default 'invoices.view') returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.invoices where tenant_id=t and id=i
 and private.has_permission(t,'invoices.view',branch_id) and private.has_permission(t,p,branch_id));
$$;
revoke all on function private.invoice_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.invoice_allowed(uuid,uuid,text) to authenticated;
alter table public.invoice_number_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_receivable_entries enable row level security;
revoke all on public.invoice_number_counters,public.invoices,public.invoice_items,public.invoice_receivable_entries from anon,authenticated;
-- Monetary data is returned as text only through checked RPCs.
create policy invoices_read on public.invoices for select to authenticated using(private.invoice_allowed(tenant_id,id));
create policy invoice_items_read on public.invoice_items for select to authenticated using(private.invoice_allowed(tenant_id,invoice_id));
create policy invoice_receivables_read on public.invoice_receivable_entries for select to authenticated using(private.invoice_allowed(tenant_id,invoice_id,'debts.view'));
drop policy financial_audit_read on public.financial_audit_events;
create policy financial_audit_read on public.financial_audit_events for select to authenticated using(
 (cashbox_id is not null and private.cashbox_allowed(tenant_id,cashbox_id,'finance.audit.view')) or
 (invoice_id is not null and private.invoice_allowed(tenant_id,invoice_id,'finance.audit.view')));

create function private.invoice_header_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Invoices are retained; discard a draft or void an issued invoice';end if;
 if (new.id,new.tenant_id,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.created_by,old.created_at)
 then raise exception 'Invoice creation identity is immutable';end if;
 if old.state<>'draft' then
  if old.state<>'issued' or new.state<>'voided' or
  (to_jsonb(new)-array['state','voided_at','voided_by','void_reason','updated_at','version']) is distinct from
  (to_jsonb(old)-array['state','voided_at','voided_by','void_reason','updated_at','version'])
  then raise exception 'Issued invoice content is immutable';end if;
 end if;
 return new;
end $$;
create trigger invoice_header_guard before update or delete on public.invoices for each row execute function private.invoice_header_guard();
create function private.invoice_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;i uuid;s text;
begin
 if tg_op='DELETE' then t:=old.tenant_id;i:=old.invoice_id;else t:=new.tenant_id;i:=new.invoice_id;end if;
 select state into s from public.invoices where tenant_id=t and id=i for update;
 if s is distinct from 'draft' then raise exception 'Only draft invoice items can change';end if;
 if tg_op='UPDATE' and (new.id,new.tenant_id,new.invoice_id) is distinct from (old.id,old.tenant_id,old.invoice_id)
 then raise exception 'Invoice item identity is immutable';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger invoice_item_guard before insert or update or delete on public.invoice_items for each row execute function private.invoice_item_guard();
create trigger invoice_receivable_immutable before update or delete on public.invoice_receivable_entries for each row execute function private.finance_immutable();

create function private.assert_invoice_consistent(t uuid,i uuid) returns void language plpgsql security definer set search_path='' as $$
declare h public.invoices;n integer;gross numeric;total numeric;
begin
 select * into h from public.invoices where tenant_id=t and id=i;
 if not found then raise exception 'Invoice is missing';end if;
 select count(*),coalesce(sum(line_total),0) into n,gross from public.invoice_items where tenant_id=t and invoice_id=i;
 total:=gross-h.discount_amount;
 if n not between 1 and 100 or total<0 or total>9999999999999999.99 then raise exception 'Invalid invoice total or item count';end if;
 if not exists(select 1 from public.financial_audit_events where tenant_id=t and invoice_id=i and operation='invoice_created')
 then raise exception 'Invoice creation audit is missing';end if;
 if h.state in ('draft','discarded') then
  if exists(select 1 from public.invoice_receivable_entries where tenant_id=t and invoice_id=i) then raise exception 'Drafts cannot create receivables';end if;
 else
  if total<=0 or not exists(select 1 from public.invoice_receivable_entries e join public.financial_audit_events a on a.tenant_id=e.tenant_id and a.id=e.audit_event_id
   where e.tenant_id=t and e.invoice_id=i and e.kind='issue' and e.amount=total and a.invoice_id=i and a.operation='invoice_issued')
  then raise exception 'Issued invoice requires its exact receivable and audit';end if;
  if h.state='issued' and exists(select 1 from public.invoice_receivable_entries where tenant_id=t and invoice_id=i and kind='void')
  then raise exception 'Only voided invoices may offset issued charges';end if;
  if h.state='voided' and not exists(select 1 from public.invoice_receivable_entries e join public.financial_audit_events a on a.tenant_id=e.tenant_id and a.id=e.audit_event_id
   where e.tenant_id=t and e.invoice_id=i and e.kind='void' and e.amount=-total and a.invoice_id=i and a.operation='invoice_voided')
  then raise exception 'Void requires an exact offset and audit';end if;
 end if;
end $$;
create function private.invoice_consistency_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;i uuid;
begin
 if tg_table_name='invoices' then t:=new.tenant_id;i:=new.id;
 elsif tg_op='DELETE' then t:=old.tenant_id;i:=old.invoice_id;else t:=new.tenant_id;i:=new.invoice_id;end if;
 perform private.assert_invoice_consistent(t,i);return null;
end $$;
create constraint trigger invoices_consistent after insert or update on public.invoices deferrable initially deferred for each row execute function private.invoice_consistency_trigger();
create constraint trigger invoice_items_consistent after insert or update or delete on public.invoice_items deferrable initially deferred for each row execute function private.invoice_consistency_trigger();
create constraint trigger invoice_receivables_consistent after insert on public.invoice_receivable_entries deferrable initially deferred for each row execute function private.invoice_consistency_trigger();
revoke all on function private.invoice_header_guard(),private.invoice_item_guard(),private.assert_invoice_consistent(uuid,uuid),private.invoice_consistency_trigger() from public,anon,authenticated;
