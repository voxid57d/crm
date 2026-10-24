-- 6D: append-only operational sources; no existing money/history is rewritten.
insert into public.permissions(key,description) values
 ('expenses.view','View authorized expenses'),('expenses.create','Record authorized expenses'),
 ('expenses.manage','Configure business expense categories and attach receipts'),
 ('cashboxes.transfer','Transfer between authorized cashboxes'),('finance.reverse','Reverse eligible financial postings'),
 ('finance.dashboard.view','View authorized financial dashboard'),('finance.reports.view','View and export authorized financial reports');
create function private.seed_financial_operations() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin') and p.key in ('expenses.view','expenses.create','expenses.manage','cashboxes.transfer','finance.reverse','finance.dashboard.view','finance.reports.view'))
 or (r.system_key='manager' and p.key in ('expenses.view','expenses.create','cashboxes.transfer','finance.dashboard.view','finance.reports.view'))) on conflict do nothing;
 insert into public.expense_categories(tenant_id,name) select new.id,n from unnest(array['Rent','Utilities','Marketing','Office supplies','Equipment','Maintenance','Transportation','Software','Miscellaneous']) n;
 return new;
end $$;
revoke all on function private.seed_financial_operations() from public,anon,authenticated;
alter table public.cashboxes add column allow_negative boolean not null default false;
alter table public.financial_transactions add column reversal_of uuid;
alter table public.financial_transactions add foreign key(tenant_id,reversal_of) references public.financial_transactions(tenant_id,id);
create unique index financial_one_reversal on public.financial_transactions(tenant_id,reversal_of) where reversal_of is not null;
alter table public.financial_transactions add check((kind='reversal')=(reversal_of is not null));
alter table public.financial_transactions drop constraint financial_transactions_kind_check;
alter table public.financial_transactions add constraint financial_transactions_kind_check check(kind in ('opening_balance','adjustment','payment','expense','transfer','refund','reversal'));
alter table public.financial_audit_events drop constraint financial_audit_events_operation_check;
alter table public.financial_audit_events add constraint financial_audit_events_operation_check check(operation in
 ('cashbox_created','cashbox_updated','opening_balance','adjustment','invoice_created','invoice_updated','invoice_issued','invoice_voided','invoice_discarded','payment','invoice_allocated','invoice_allocation_released','expense','transfer','refund','reversal'));
alter table public.financial_audit_events drop constraint financial_audit_events_check;
alter table public.financial_audit_events add constraint financial_audit_events_check check((operation in ('opening_balance','adjustment','payment','expense','transfer','refund','reversal'))=(transaction_id is not null));

create table public.expense_categories (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),name text not null check(length(trim(name)) between 1 and 100),
 is_active boolean not null default true,version integer not null default 1 check(version>0),unique(tenant_id,id),unique(tenant_id,name)
);
create table public.financial_configuration_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),category_id uuid not null,
 actor_id uuid not null references auth.users(id),actor_name text not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,category_id) references public.expense_categories(tenant_id,id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,branch_id uuid not null,cashbox_id uuid not null,category_id uuid not null,
 transaction_id uuid not null,currency text not null,amount numeric not null check(amount>0 and amount=trunc(amount,2) and amount<=9999999999999999.99),
 occurred_at timestamptz not null,description text not null check(length(trim(description)) between 3 and 1000),vendor text not null default '' check(length(vendor)<=150),
 category_name text not null,unique(tenant_id,id),unique(tenant_id,transaction_id),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id),foreign key(tenant_id,cashbox_id,currency) references public.cashboxes(tenant_id,id,currency),
 foreign key(tenant_id,category_id) references public.expense_categories(tenant_id,id),foreign key(tenant_id,transaction_id) references public.financial_transactions(tenant_id,id)
);
create table public.cashbox_transfers (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,source_id uuid not null,destination_id uuid not null,transaction_id uuid not null,
 currency text not null,amount numeric not null check(amount>0 and amount=trunc(amount,2) and amount<=9999999999999999.99),occurred_at timestamptz not null,
 unique(tenant_id,id),unique(tenant_id,transaction_id),check(source_id<>destination_id),
 foreign key(tenant_id,source_id,currency) references public.cashboxes(tenant_id,id,currency),foreign key(tenant_id,destination_id,currency) references public.cashboxes(tenant_id,id,currency),
 foreign key(tenant_id,transaction_id) references public.financial_transactions(tenant_id,id)
);
create table public.payment_refunds (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,payment_id uuid not null,cashbox_id uuid not null,transaction_id uuid not null,currency text not null,
 amount numeric not null check(amount>0 and amount=trunc(amount,2) and amount<=9999999999999999.99),occurred_at timestamptz not null,
 unique(tenant_id,id),unique(tenant_id,transaction_id),foreign key(tenant_id,payment_id) references public.payments(tenant_id,id),
 foreign key(tenant_id,cashbox_id,currency) references public.cashboxes(tenant_id,id,currency),foreign key(tenant_id,transaction_id) references public.financial_transactions(tenant_id,id)
);
create index expenses_branch_date on public.expenses(tenant_id,branch_id,occurred_at desc,id);
create index expenses_box on public.expenses(tenant_id,cashbox_id);
create index expenses_category on public.expenses(tenant_id,category_id);
create index refunds_payment on public.payment_refunds(tenant_id,payment_id);
create index transfers_source on public.cashbox_transfers(tenant_id,source_id);
create index transfers_destination on public.cashbox_transfers(tenant_id,destination_id);
create function private.expense_allowed(t uuid,e uuid,p text default 'expenses.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.expenses where tenant_id=t and id=e and private.has_permission(t,'expenses.view',branch_id) and private.has_permission(t,p,branch_id) and private.cashbox_allowed(t,cashbox_id));
$$;
revoke all on function private.expense_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.expense_allowed(uuid,uuid,text) to authenticated;
alter table public.expense_categories enable row level security;alter table public.financial_configuration_events enable row level security;
alter table public.expenses enable row level security;alter table public.cashbox_transfers enable row level security;alter table public.payment_refunds enable row level security;
revoke all on public.expense_categories,public.financial_configuration_events,public.expenses,public.cashbox_transfers,public.payment_refunds from anon,authenticated;
create policy expense_categories_read on public.expense_categories for select to authenticated using(private.has_permission(tenant_id,'expenses.view') or exists(select 1 from public.branches b where b.tenant_id=expense_categories.tenant_id and private.has_permission(b.tenant_id,'expenses.view',b.id)));
create policy financial_configuration_read on public.financial_configuration_events for select to authenticated using(private.has_permission(tenant_id,'finance.audit.view'));
create policy expenses_read on public.expenses for select to authenticated using(private.expense_allowed(tenant_id,id));
create policy transfers_read on public.cashbox_transfers for select to authenticated using(private.financial_transaction_allowed(tenant_id,transaction_id));
create policy refunds_read on public.payment_refunds for select to authenticated using(private.payment_allowed(tenant_id,payment_id) and private.cashbox_allowed(tenant_id,cashbox_id));
create trigger expenses_immutable before update or delete on public.expenses for each row execute function private.finance_immutable();
create trigger transfers_immutable before update or delete on public.cashbox_transfers for each row execute function private.finance_immutable();
create trigger refunds_immutable before update or delete on public.payment_refunds for each row execute function private.finance_immutable();
create trigger configuration_immutable before update or delete on public.financial_configuration_events for each row execute function private.finance_immutable();
create trigger zzzzzzz_seed_financial_operations after insert on public.tenants for each row execute function private.seed_financial_operations();
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 ((r.system_key in ('owner','admin') and p.key in ('expenses.view','expenses.create','expenses.manage','cashboxes.transfer','finance.reverse','finance.dashboard.view','finance.reports.view'))
 or (r.system_key='manager' and p.key in ('expenses.view','expenses.create','cashboxes.transfer','finance.dashboard.view','finance.reports.view'))) on conflict do nothing;
insert into public.expense_categories(tenant_id,name) select t.id,n from public.tenants t cross join unnest(array['Rent','Utilities','Marketing','Office supplies','Equipment','Maintenance','Transportation','Software','Miscellaneous']) n;
