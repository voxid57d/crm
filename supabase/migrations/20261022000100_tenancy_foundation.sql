-- Foundation only. Provisioning and membership mutations are intentionally
-- unavailable to API roles until audited onboarding/invitation flows exist.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('owner', 'admin', 'manager', 'teacher', 'staff');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_type text not null default 'education',
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 150),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.branch_memberships (
  tenant_id uuid not null,
  branch_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, branch_id, user_id),
  foreign key (tenant_id, branch_id) references public.branches(tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references public.tenant_memberships(tenant_id, user_id) on delete cascade
);

create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission) values
  ('owner', 'tenant.read'), ('owner', 'tenant.update'),
  ('owner', 'branches.read'), ('owner', 'branches.manage'), ('owner', 'members.read'),
  ('admin', 'tenant.read'), ('admin', 'tenant.update'),
  ('admin', 'branches.read'), ('admin', 'branches.manage'), ('admin', 'members.read'),
  ('manager', 'tenant.read'), ('manager', 'branches.read'),
  ('teacher', 'tenant.read'), ('teacher', 'branches.read'),
  ('staff', 'tenant.read'), ('staff', 'branches.read');

create index tenant_memberships_user_idx on public.tenant_memberships (user_id, tenant_id);
create index branch_memberships_user_idx on public.branch_memberships (user_id, tenant_id, branch_id);

-- Fixed search_path and explicit names prevent object-shadowing attacks.
-- This avoids recursive RLS on the membership tables. Only evaluates auth.uid().
create function private.has_permission(target_tenant uuid, requested_permission text, target_branch uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships m
    join public.role_permissions p on p.role = m.role
    where m.tenant_id = target_tenant
      and m.user_id = (select auth.uid())
      and m.is_active and p.permission = requested_permission
      and (
        target_branch is null
        or (exists (select 1 from public.branches b where b.id = target_branch and b.tenant_id = target_tenant)
          and (m.role in ('owner', 'admin') or exists (
            select 1 from public.branch_memberships bm
            where bm.tenant_id = target_tenant and bm.branch_id = target_branch and bm.user_id = m.user_id
          )))
      )
  );
$$;
revoke all on function private.has_permission(uuid, text, uuid) from public, anon;
grant execute on function private.has_permission(uuid, text, uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.branches enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.branch_memberships enable row level security;
alter table public.role_permissions enable row level security;

-- Remove potentially permissive Supabase default grants. Allow only operations
-- with explicit policies. No browser can assign roles, create tenants, or enroll.
revoke all on public.tenants, public.branches, public.tenant_memberships,
  public.branch_memberships, public.role_permissions from anon, authenticated;
grant select on public.tenants, public.branches, public.tenant_memberships,
  public.branch_memberships, public.role_permissions to authenticated;
grant update (name, business_type) on public.tenants to authenticated;
grant insert (tenant_id, name), update (name) on public.branches to authenticated;

create policy tenants_read on public.tenants for select to authenticated
  using (private.has_permission(id, 'tenant.read'));
create policy tenants_update on public.tenants for update to authenticated
  using (private.has_permission(id, 'tenant.update'))
  with check (private.has_permission(id, 'tenant.update'));
create policy branches_read on public.branches for select to authenticated
  using (private.has_permission(tenant_id, 'branches.read', id));
create policy branches_insert on public.branches for insert to authenticated
  with check (private.has_permission(tenant_id, 'branches.manage'));
create policy branches_update on public.branches for update to authenticated
  using (private.has_permission(tenant_id, 'branches.manage', id))
  with check (private.has_permission(tenant_id, 'branches.manage', id));
create policy memberships_read on public.tenant_memberships for select to authenticated
  using ((user_id = (select auth.uid()) and is_active) or private.has_permission(tenant_id, 'members.read'));
create policy branch_memberships_read on public.branch_memberships for select to authenticated
  using ((user_id = (select auth.uid()) and private.has_permission(tenant_id, 'tenant.read'))
    or private.has_permission(tenant_id, 'members.read'));
create policy permissions_read on public.role_permissions for select to authenticated using (true);

comment on table public.tenants is 'Business boundary. Every future business table must carry tenant_id and enable RLS.';
comment on table public.branches is 'Branch-scoped records must use a composite (tenant_id, branch_id) foreign key.';
comment on table public.tenant_memberships is 'Tenant-level role. Only trusted provisioning can mutate memberships.';
comment on table public.branch_memberships is 'Explicit branch access for non-owner/admin roles; never crosses tenants.';
