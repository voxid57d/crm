-- Additive upgrade. Legacy teacher/staff roles remain valid and read-only.
alter table public.tenant_memberships alter column role set default 'employee';
alter table public.tenants
  add column contact_email text not null default '' check (length(contact_email) <= 254),
  add column phone text not null default '' check (length(phone) <= 40),
  add column address text not null default '' check (length(address) <= 500),
  add column currency text not null default 'UZS' check (currency ~ '^[A-Z]{3}$'),
  add column timezone text not null default 'Asia/Tashkent',
  add column owner_id uuid references auth.users(id) on delete restrict;

-- Preserve an existing active owner; refuse orphaned/ambiguous legacy records.
do $$
begin
  if exists (select 1 from public.tenants t where
    (select count(*) from public.tenant_memberships m where m.tenant_id = t.id and m.role = 'owner' and m.is_active) <> 1)
  then raise exception 'Each existing business must have exactly one active owner before this migration'; end if;
end $$;
update public.tenants t set owner_id = (select m.user_id from public.tenant_memberships m
  where m.tenant_id = t.id and m.role = 'owner' and m.is_active);
alter table public.tenants alter column owner_id set not null;
alter table public.tenants add constraint tenant_owner_membership_fk
  foreign key (id, owner_id) references public.tenant_memberships(tenant_id, user_id)
  deferrable initially deferred;
create unique index tenant_one_active_owner_idx on public.tenant_memberships(tenant_id)
  where role = 'owner' and is_active;

alter table public.branches
  add column address text not null default '' check (length(address) <= 500),
  add column phone text not null default '' check (length(phone) <= 40),
  add column is_active boolean not null default true;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 150),
  phone text not null default '' check (length(phone) <= 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update (full_name, phone) on public.profiles to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 150));
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
insert into public.profiles(id, full_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 150) from auth.users on conflict (id) do nothing;

create function private.validate_tenant_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  if length(trim(new.business_type)) not between 1 and 80 then
    raise exception 'Invalid business type' using errcode = '23514';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_tenant_settings() from public, anon, authenticated;
create trigger validate_tenant_settings before insert or update on public.tenants
  for each row execute function private.validate_tenant_settings();

-- A deferred invariant permits atomic onboarding but never a committed business
-- without its canonical active Owner membership.
create function private.enforce_business_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare business_id uuid;
begin
  if tg_table_name = 'tenants' then business_id := new.id;
  elsif tg_op = 'DELETE' then business_id := old.tenant_id;
  else business_id := new.tenant_id;
  end if;
  if exists (select 1 from public.tenants t where t.id = business_id and not exists (
    select 1 from public.tenant_memberships m where m.tenant_id = t.id
      and m.user_id = t.owner_id and m.role = 'owner' and m.is_active
  )) then raise exception 'Business requires its active Owner membership' using errcode = '23514'; end if;
  return null;
end $$;
revoke all on function private.enforce_business_owner() from public, anon, authenticated;
create constraint trigger enforce_tenant_owner after insert or update on public.tenants
  deferrable initially deferred for each row execute function private.enforce_business_owner();
create constraint trigger enforce_membership_owner after insert or update or delete on public.tenant_memberships
  deferrable initially deferred for each row execute function private.enforce_business_owner();

insert into public.role_permissions(role, permission) values
  ('owner','branches.create'), ('owner','branches.update'), ('owner','members.manage'),
  ('admin','branches.create'), ('admin','branches.update'),
  ('manager','branches.update'),
  ('employee','tenant.read'), ('employee','branches.read');

create or replace function private.has_permission(target_tenant uuid, requested_permission text, target_branch uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_memberships m
    join public.role_permissions p on p.role = m.role
    where m.tenant_id = target_tenant and m.user_id = (select auth.uid())
      and m.is_active and p.permission = requested_permission
      and (target_branch is null or exists (
        select 1 from public.branches b where b.id = target_branch and b.tenant_id = target_tenant
          and (b.is_active or m.role in ('owner','admin','manager'))
          and (m.role in ('owner','admin') or exists (
            select 1 from public.branch_memberships bm where bm.tenant_id = target_tenant
              and bm.branch_id = target_branch and bm.user_id = m.user_id
          ))
      ))
  );
$$;
revoke all on function private.has_permission(uuid,text,uuid) from public, anon;
grant execute on function private.has_permission(uuid,text,uuid) to authenticated;

-- Replace only policies, not records. Manager edits remain branch-scoped.
-- Stable helper queries cannot see a just-inserted branch in INSERT RETURNING.
-- Tenant-wide managers can read their new row using a tenant-only check;
-- assigned roles still require the row's actual tenant/branch pair.
drop policy branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated
  using (private.has_permission(tenant_id, 'branches.manage')
    or private.has_permission(tenant_id, 'branches.read', id));
drop policy branches_insert on public.branches;
drop policy branches_update on public.branches;
create policy branches_insert on public.branches for insert to authenticated
  with check (private.has_permission(tenant_id, 'branches.create'));
create policy branches_update on public.branches for update to authenticated
  using (private.has_permission(tenant_id, 'branches.update', id))
  with check (private.has_permission(tenant_id, 'branches.update', id));
grant insert (address, phone, is_active), update (address, phone, is_active) on public.branches to authenticated;
grant update (contact_email, phone, address, currency, timezone) on public.tenants to authenticated;

create function public.create_business(
  p_name text, p_business_type text default 'education', p_contact_email text default '',
  p_phone text default '', p_address text default '', p_branch_name text default 'Main branch'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); business_id uuid := gen_random_uuid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.tenants(id, name, slug, business_type, contact_email, phone, address, owner_id)
    values (business_id, trim(p_name), 'business-' || business_id::text, trim(p_business_type),
      trim(p_contact_email), trim(p_phone), trim(p_address), actor);
  insert into public.tenant_memberships(tenant_id, user_id, role) values (business_id, actor, 'owner');
  insert into public.branches(tenant_id, name) values (business_id, trim(p_branch_name));
  return business_id;
end $$;
revoke all on function public.create_business(text,text,text,text,text,text) from public, anon;
grant execute on function public.create_business(text,text,text,text,text,text) to authenticated;

-- Memberships remain immutable through direct API DML. Only an active Owner
-- can explicitly enroll an already registered account and replace assignments.
create function public.set_business_member(
  p_tenant uuid, p_email text, p_role public.app_role, p_branches uuid[] default '{}', p_active boolean default true
) returns void language plpgsql security definer set search_path = '' as $$
declare target_user uuid; business_owner uuid;
begin
  if not private.has_permission(p_tenant, 'members.manage') then
    raise exception 'Owner permission required' using errcode = '42501'; end if;
  select owner_id into business_owner from public.tenants where id = p_tenant for update;
  if p_role is null or p_role not in ('admin','manager','employee') or p_active is null then
    raise exception 'Choose Admin, Branch Manager, or Employee' using errcode = '22023'; end if;
  select id into target_user from auth.users where lower(email) = lower(trim(p_email));
  if target_user is null then raise exception 'Account must register first' using errcode = '22023'; end if;
  if target_user = business_owner then raise exception 'Owner cannot be reassigned or suspended' using errcode = '42501'; end if;
  if exists (select 1 from unnest(p_branches) selected(id) where selected.id is null or not exists (
    select 1 from public.branches b where b.tenant_id = p_tenant and b.id = selected.id
  )) then raise exception 'Branch does not belong to this business' using errcode = '42501'; end if;
  if p_active and p_role in ('manager','employee') and coalesce(cardinality(p_branches),0) = 0 then
    raise exception 'Assign at least one branch' using errcode = '22023'; end if;
  insert into public.tenant_memberships(tenant_id,user_id,role,is_active)
    values (p_tenant,target_user,p_role,p_active)
    on conflict (tenant_id,user_id) do update set role = excluded.role, is_active = excluded.is_active;
  delete from public.branch_memberships where tenant_id = p_tenant and user_id = target_user;
  insert into public.branch_memberships(tenant_id,branch_id,user_id)
    select p_tenant, selected.id, target_user from (select distinct unnest(p_branches) id) selected;
end $$;
revoke all on function public.set_business_member(uuid,text,public.app_role,uuid[],boolean) from public, anon;
grant execute on function public.set_business_member(uuid,text,public.app_role,uuid[],boolean) to authenticated;

create function public.list_business_members(p_tenant uuid)
returns table(user_id uuid, full_name text, email text, role public.app_role, is_active boolean, branch_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_tenant, 'members.read') then
    raise exception 'Team access denied' using errcode = '42501'; end if;
  return query select m.user_id, coalesce(p.full_name,''), u.email::text, m.role, m.is_active,
    array(select bm.branch_id from public.branch_memberships bm where bm.tenant_id = m.tenant_id and bm.user_id = m.user_id)
    from public.tenant_memberships m join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id where m.tenant_id = p_tenant;
end $$;
revoke all on function public.list_business_members(uuid) from public, anon;
grant execute on function public.list_business_members(uuid) to authenticated;
