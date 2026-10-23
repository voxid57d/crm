-- Additive: preserve original enum roles as compatibility keys, not a second ACL.
create table public.permissions (
  key text primary key, description text not null,
  assignable boolean not null default true
);
insert into public.permissions(key,description) select key,key from unnest(array[
 'employees.view','employees.create','employees.update','employees.archive',
 'branches.view','branches.manage','customers.view','customers.create','customers.update',
 'leads.view','leads.manage','payments.view','payments.create','payments.refund',
 'cashboxes.view','cashboxes.manage','salaries.view','salaries.manage',
 'courses.view','courses.manage','lessons.view','lessons.manage',
 'attendance.view','attendance.manage','reports.view','roles.manage']) key;
insert into public.permissions(key,description,assignable) select distinct permission,permission,false
 from public.role_permissions on conflict do nothing;
update public.permissions set assignable=true where key='members.read';
create table public.business_roles (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 80),
 system_key text, scope text not null check(scope in ('business','branch')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,name), unique(tenant_id,system_key)
);
create table public.business_role_permissions (
 tenant_id uuid not null, role_id uuid not null, permission text not null references public.permissions(key),
 primary key(tenant_id,role_id,permission),
 foreign key(tenant_id,role_id) references public.business_roles(tenant_id,id)
);
create function private.seed_business_roles() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_roles(tenant_id,name,system_key,scope)
 select new.id,n,k,s from (values ('Owner','owner','business'),('Admin','admin','business'),
 ('Branch Manager','manager','branch'),('Sales Manager','sales_manager','branch'),
 ('Cashier','cashier','branch'),('Teacher','teacher','branch'),('Employee','employee','branch'),('Staff (legacy)','staff','branch')) r(n,k,s);
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select new.id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and (
 r.system_key='owner' or (r.system_key='admin' and p.key<>'members.manage') or
 p.key in ('tenant.read','branches.view') or
 (r.system_key='manager' and p.key in ('branches.manage','employees.view','employees.update','reports.view')) or
 (r.system_key='sales_manager' and p.key in ('customers.view','customers.create','customers.update','leads.view','leads.manage')) or
 (r.system_key='cashier' and p.key in ('payments.view','payments.create','cashboxes.view')) or
 (r.system_key='teacher' and p.key in ('courses.view','lessons.view','attendance.view','attendance.manage')));
 return new;
end $$;
revoke all on function private.seed_business_roles() from public,anon,authenticated;
-- Backfill using the same seed path as future onboarding.
create trigger seed_business_roles after insert on public.tenants for each row execute function private.seed_business_roles();
do $$ declare t record; begin
 for t in select * from public.tenants loop
   insert into public.business_roles(tenant_id,name,system_key,scope)
   select t.id,n,k,s from (values ('Owner','owner','business'),('Admin','admin','business'),('Branch Manager','manager','branch'),
   ('Sales Manager','sales_manager','branch'),('Cashier','cashier','branch'),('Teacher','teacher','branch'),('Employee','employee','branch'),('Staff (legacy)','staff','branch')) r(n,k,s);
 end loop;
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 r.system_key='owner' or (r.system_key='admin' and p.key<>'members.manage') or p.key in ('tenant.read','branches.view') or
 (r.system_key='manager' and p.key in ('branches.manage','employees.view','employees.update','reports.view')) or
 (r.system_key='sales_manager' and p.key in ('customers.view','customers.create','customers.update','leads.view','leads.manage')) or
 (r.system_key='cashier' and p.key in ('payments.view','payments.create','cashboxes.view')) or
 (r.system_key='teacher' and p.key in ('courses.view','lessons.view','attendance.view','attendance.manage'));
end $$;
alter table public.tenant_memberships add column role_id uuid;
update public.tenant_memberships m set role_id=r.id from public.business_roles r where r.tenant_id=m.tenant_id and r.system_key=m.role::text;
-- Flush the existing deferred owner-integrity triggers before ALTERing a
-- populated membership table. No records or constraints are discarded.
set constraints all immediate;
alter table public.tenant_memberships alter column role_id set not null;
alter table public.tenant_memberships add foreign key(tenant_id,role_id) references public.business_roles(tenant_id,id);
alter table public.branch_memberships add column role_id uuid;
alter table public.branch_memberships add foreign key(tenant_id,role_id) references public.business_roles(tenant_id,id);
set constraints all deferred;
create function private.sync_membership_role() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;
begin
 if new.role_id is null or (tg_op='UPDATE' and new.role<>old.role and new.role_id=old.role_id) then
   select id into new.role_id from public.business_roles where tenant_id=new.tenant_id and system_key=new.role::text;
 end if;
 select system_key into k from public.business_roles where tenant_id=new.tenant_id and id=new.role_id;
 new.role:=case when k in ('owner','admin','manager','teacher','employee','staff') then k::public.app_role else 'employee'::public.app_role end;
 return new;
end $$;
revoke all on function private.sync_membership_role() from public,anon,authenticated;
create trigger sync_membership_role before insert or update on public.tenant_memberships for each row execute function private.sync_membership_role();

create table public.employees (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 user_id uuid, full_name text not null check(length(trim(full_name)) between 1 and 150),
 phone text not null default '' check(length(phone)<=40), email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 job_title text not null default '' check(length(job_title)<=150),
 status text not null default 'active' check(status in ('active','inactive','archived')),
 start_date date not null, notes text not null default '' check(length(notes)<=5000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,user_id),
 foreign key(tenant_id,user_id) references public.tenant_memberships(tenant_id,user_id)
);
create unique index employees_email_idx on public.employees(tenant_id,lower(email)) where email is not null;
create index employees_directory_idx on public.employees(tenant_id,status,full_name);
create table public.employee_branches (
 tenant_id uuid not null, employee_id uuid not null, branch_id uuid not null,
 primary key(tenant_id,employee_id,branch_id),
 foreign key(tenant_id,employee_id) references public.employees(tenant_id,id),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id)
);
create index employee_branches_branch_idx on public.employee_branches(tenant_id,branch_id,employee_id);
create table public.employee_salary_settings (
 tenant_id uuid not null, employee_id uuid not null,
 salary_type text not null check(salary_type in ('none','fixed_monthly','hourly','per_lesson','percentage','base_bonus')),
 amount numeric(18,2), percentage numeric(7,4), bonus_amount numeric(18,2), bonus_percentage numeric(7,4),
 bonus_basis text not null default '' check(length(bonus_basis)<=1000), currency text not null check(currency ~ '^[A-Z]{3}$'),
 updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
 primary key(tenant_id,employee_id), foreign key(tenant_id,employee_id) references public.employees(tenant_id,id),
 check(amount is null or amount>=0), check(percentage is null or percentage between 0 and 100),
 check(bonus_amount is null or bonus_amount>=0), check(bonus_percentage is null or bonus_percentage between 0 and 100),
 check((salary_type='none' and amount is null and percentage is null and bonus_amount is null and bonus_percentage is null and bonus_basis='') or
 (salary_type in ('fixed_monthly','hourly','per_lesson') and amount is not null and percentage is null and bonus_amount is null and bonus_percentage is null and bonus_basis='') or
 (salary_type='percentage' and percentage is not null and amount is null and bonus_amount is null and bonus_percentage is null and length(trim(bonus_basis))>0) or
 (salary_type='base_bonus' and amount is not null and percentage is null and (bonus_amount is not null or bonus_percentage is not null) and length(trim(bonus_basis))>0))
);
create table public.employee_salary_history (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, employee_id uuid not null,
 previous_settings jsonb, new_settings jsonb not null, reason text not null check(length(trim(reason)) between 3 and 1000),
 changed_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(tenant_id,employee_id) references public.employees(tenant_id,id)
);
create index salary_history_employee_idx on public.employee_salary_history(tenant_id,employee_id,created_at desc);
create table public.employee_invitations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, employee_id uuid not null,
 email text not null, role_id uuid not null, token_hash text not null unique,
 invited_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz,
 foreign key(tenant_id,employee_id) references public.employees(tenant_id,id),
 foreign key(tenant_id,role_id) references public.business_roles(tenant_id,id)
);
create unique index employee_invitation_pending_idx on public.employee_invitations(tenant_id,employee_id) where accepted_at is null and revoked_at is null;

-- All authorization continues through this existing helper.
create function private.member_enabled(t uuid, u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=u and is_active)
 and not exists(select 1 from public.employees where tenant_id=t and user_id=u and status<>'active');
$$;
create or replace function private.has_permission(target_tenant uuid, requested_permission text, target_branch uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tenant_memberships m join public.business_roles r on r.id=m.role_id and r.tenant_id=m.tenant_id
 where m.tenant_id=target_tenant and m.user_id=(select auth.uid()) and private.member_enabled(target_tenant,m.user_id)
 and exists(select 1 from public.permissions where key=requested_permission)
 and (
 (r.scope='business' and exists(select 1 from public.business_role_permissions p where p.tenant_id=m.tenant_id and p.role_id=r.id
   and p.permission=case requested_permission when 'branches.read' then 'branches.view' when 'branches.update' then 'branches.manage' when 'branches.create' then 'branches.manage' else requested_permission end)
   and (target_branch is null or exists(select 1 from public.branches b where b.tenant_id=target_tenant and b.id=target_branch)))
 or (requested_permission='tenant.read')
 or (target_branch is not null and exists(select 1 from public.branch_memberships bm
   join public.branches b on b.id=bm.branch_id and b.tenant_id=bm.tenant_id
   join public.business_role_permissions p on p.role_id=coalesce(bm.role_id,m.role_id) and p.tenant_id=m.tenant_id
   where bm.tenant_id=target_tenant and bm.user_id=m.user_id and bm.branch_id=target_branch
   and (b.is_active or exists(select 1 from public.business_role_permissions q where q.role_id=coalesce(bm.role_id,m.role_id)
     and q.tenant_id=m.tenant_id and q.permission='branches.manage'))
   and p.permission=case requested_permission when 'branches.read' then 'branches.view' when 'branches.update' then 'branches.manage' else requested_permission end))
 ));
$$;
create function private.employee_allowed(t uuid,e uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employees where tenant_id=t and id=e) and
 (private.has_permission(t,p) or (
 exists(select 1 from public.employee_branches where tenant_id=t and employee_id=e) and not exists(
 select 1 from public.employee_branches eb where eb.tenant_id=t and eb.employee_id=e and not private.has_permission(t,p,eb.branch_id))));
$$;
revoke all on function private.member_enabled(uuid,uuid),private.employee_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.member_enabled(uuid,uuid),private.employee_allowed(uuid,uuid,text) to authenticated;
revoke all on function private.has_permission(uuid,text,uuid) from public,anon;
grant execute on function private.has_permission(uuid,text,uuid) to authenticated;

alter table public.permissions enable row level security;
alter table public.business_roles enable row level security;
alter table public.business_role_permissions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_branches enable row level security;
alter table public.employee_salary_settings enable row level security;
alter table public.employee_salary_history enable row level security;
alter table public.employee_invitations enable row level security;
revoke all on public.permissions,public.business_roles,public.business_role_permissions,public.employees,public.employee_branches,
 public.employee_salary_settings,public.employee_salary_history,public.employee_invitations from anon,authenticated;
grant select on public.permissions,public.business_roles,public.business_role_permissions,public.employees,public.employee_branches to authenticated;
create policy permission_catalog_read on public.permissions for select to authenticated using(true);
create policy business_roles_read on public.business_roles for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy role_grants_read on public.business_role_permissions for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy employees_read on public.employees for select to authenticated using(private.employee_allowed(tenant_id,id,'employees.view'));
create policy employee_branches_read on public.employee_branches for select to authenticated using(private.employee_allowed(tenant_id,employee_id,'employees.view'));
-- Salary/invitation tables have no API grants or policies: access only through
-- the checked RPCs below. This also prevents accidental nested-select leakage.
drop policy branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated using(
 private.has_permission(tenant_id,'branches.create') or private.has_permission(tenant_id,'branches.view',id));
create function public.permission_grants(p_tenant uuid) returns table(permission text,branch_id uuid)
language sql stable security definer set search_path='' as $$
 select p.key,null::uuid from public.permissions p where private.has_permission(p_tenant,p.key)
 union all select p.key,b.id from public.permissions p cross join public.branches b
 where b.tenant_id=p_tenant and private.has_permission(p_tenant,p.key,b.id);
$$;
revoke all on function public.permission_grants(uuid) from public,anon;
grant execute on function public.permission_grants(uuid) to authenticated;
