-- Additive customer/student foundation; no existing records are reset.
insert into public.permissions(key,description) select k,k from unnest(array[
 'customers.archive','customers.manage_tags','customers.manage_settings',
 'customers.view_notes','customers.manage_notes']) k on conflict do nothing;

create table public.customer_statuses (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 80), is_active boolean not null default true,
 is_default boolean not null default false, created_at timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,name), check(not is_default or is_active)
);
create unique index customer_default_status_idx on public.customer_statuses(tenant_id) where is_default;
create table public.customer_tags (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 80), is_active boolean not null default true,
 created_at timestamptz not null default now(), unique(tenant_id,id), unique(tenant_id,name)
);
create table public.customer_field_definitions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 80),
 field_type text not null check(field_type in ('text','number','date','boolean')),
 is_active boolean not null default true, created_at timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,name)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 first_name text not null check(length(trim(first_name)) between 1 and 100),
 last_name text not null default '' check(length(last_name)<=100),
 phone text not null check(length(trim(phone)) between 3 and 40 and phone ~ '[0-9]'),
 additional_phone text check(additional_phone is null or (length(additional_phone) between 3 and 40 and additional_phone ~ '[0-9]')),
 email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 date_of_birth date, gender text check(gender in ('female','male','other','undisclosed')),
 address text check(length(address)<=1000), status_id uuid not null, responsible_employee_id uuid,
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,id), foreign key(tenant_id,status_id) references public.customer_statuses(tenant_id,id),
 foreign key(tenant_id,responsible_employee_id) references public.employees(tenant_id,id)
);
create index customers_directory_idx on public.customers(tenant_id,archived_at,first_name,last_name,id);
create index customers_status_idx on public.customers(tenant_id,status_id);
create index customers_responsible_idx on public.customers(tenant_id,responsible_employee_id);
create index customers_email_idx on public.customers(tenant_id,lower(email));
create index customers_phone_idx on public.customers(tenant_id,(regexp_replace(phone,'[^0-9]','','g')));
create table public.customer_branches (
 tenant_id uuid not null, customer_id uuid not null, branch_id uuid not null,
 primary key(tenant_id,customer_id,branch_id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id)
);
create index customer_branches_branch_idx on public.customer_branches(tenant_id,branch_id,customer_id);
create table public.customer_tag_links (
 tenant_id uuid not null, customer_id uuid not null, tag_id uuid not null,
 primary key(tenant_id,customer_id,tag_id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 foreign key(tenant_id,tag_id) references public.customer_tags(tenant_id,id)
);
create index customer_tag_filter_idx on public.customer_tag_links(tenant_id,tag_id,customer_id);
create table public.student_profiles (
 tenant_id uuid not null, customer_id uuid not null, student_identifier text not null check(length(trim(student_identifier)) between 1 and 80),
 education_status text not null default 'active' check(education_status in ('prospective','active','on_hold','completed','withdrawn')),
 school text check(length(school)<=200), education_level text check(length(education_level)<=150),
 learning_goals text check(length(learning_goals)<=2000), additional_information text check(length(additional_information)<=3000),
 enrollment_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,customer_id), unique(tenant_id,student_identifier),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id)
);
create table public.customer_field_values (
 tenant_id uuid not null, customer_id uuid not null, field_id uuid not null, value text not null check(length(value)<=2000),
 primary key(tenant_id,customer_id,field_id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 foreign key(tenant_id,field_id) references public.customer_field_definitions(tenant_id,id)
);
create table public.customer_notes (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, customer_id uuid not null,
 body text not null check(length(trim(body)) between 1 and 5000), kind text not null check(kind in ('note','call','email','meeting','message')),
 author_id uuid not null references auth.users(id), author_name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,customer_id,id), foreign key(tenant_id,customer_id) references public.customers(tenant_id,id)
);
create index customer_notes_timeline_idx on public.customer_notes(tenant_id,customer_id,created_at desc,id);
create table public.customer_activities (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, customer_id uuid not null,
 actor_id uuid not null references auth.users(id), actor_name text not null,
 kind text not null, detail jsonb not null default '{}', notes_only boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id)
);
create index customer_activities_timeline_idx on public.customer_activities(tenant_id,customer_id,created_at desc,id);
create table public.guardians (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 full_name text not null check(length(trim(full_name)) between 1 and 150),
 phone text not null check(length(trim(phone)) between 3 and 40 and phone ~ '[0-9]'),
 email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id,id)
);
create table public.student_guardians (
 tenant_id uuid not null, customer_id uuid not null, guardian_id uuid not null,
 relationship text not null check(length(trim(relationship)) between 1 and 80), is_emergency boolean not null default false,
 primary key(tenant_id,customer_id,guardian_id),
 foreign key(tenant_id,customer_id) references public.student_profiles(tenant_id,customer_id),
 foreign key(tenant_id,guardian_id) references public.guardians(tenant_id,id)
);
create index student_guardians_guardian_idx on public.student_guardians(tenant_id,guardian_id,customer_id);

create function private.seed_customer_settings() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.customer_statuses(tenant_id,name,is_default) values(new.id,'New',true),(new.id,'Active',false),
 (new.id,'Inactive',false),(new.id,'On Hold',false),(new.id,'Former Customer',false);
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select new.id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin') and p.key like 'customers.%') or
 (r.system_key in ('manager','sales_manager') and p.key in ('customers.view','customers.create','customers.update','customers.view_notes','customers.manage_notes')))
 on conflict do nothing;
 return new;
end $$;
create trigger zz_seed_customer_settings after insert on public.tenants for each row execute function private.seed_customer_settings();
insert into public.customer_statuses(tenant_id,name,is_default)
 select t.id,s.name,s.def from public.tenants t cross join (values ('New',true),('Active',false),('Inactive',false),('On Hold',false),('Former Customer',false)) s(name,def);
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 (r.system_key in ('owner','admin') and p.key like 'customers.%') or
 (r.system_key in ('manager','sales_manager') and p.key in ('customers.view','customers.create','customers.update','customers.view_notes','customers.manage_notes')) on conflict do nothing;

create function private.customer_allowed(t uuid,c uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.customers where tenant_id=t and id=c) and
 (private.has_permission(t,p) or (exists(select 1 from public.customer_branches where tenant_id=t and customer_id=c)
 and not exists(select 1 from public.customer_branches cb where cb.tenant_id=t and cb.customer_id=c and not private.has_permission(t,p,cb.branch_id))));
$$;
create function private.guardian_allowed(t uuid,g uuid,p text,all_students boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_guardians where tenant_id=t and guardian_id=g and private.customer_allowed(t,customer_id,p))
 and (not all_students or not exists(select 1 from public.student_guardians where tenant_id=t and guardian_id=g and not private.customer_allowed(t,customer_id,p)));
$$;
create function private.customer_audit(t uuid,c uuid,k text,d jsonb default '{}',n boolean default false) returns void language sql security definer set search_path='' as $$
 insert into public.customer_activities(tenant_id,customer_id,actor_id,actor_name,kind,detail,notes_only)
 values(t,c,auth.uid(),coalesce((select nullif(full_name,'') from public.profiles where id=auth.uid()),'Account '||auth.uid()::text),k,d,n);
$$;
revoke all on function private.seed_customer_settings(),private.customer_audit(uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function private.customer_allowed(uuid,uuid,text),private.guardian_allowed(uuid,uuid,text,boolean) from public,anon;
grant execute on function private.customer_allowed(uuid,uuid,text),private.guardian_allowed(uuid,uuid,text,boolean) to authenticated;

-- Tables are read-only to clients. Mutations below are checked transactional RPCs.
do $$ declare tbl text; begin
 foreach tbl in array array['customer_statuses','customer_tags','customer_field_definitions','customers','customer_branches',
 'customer_tag_links','student_profiles','customer_field_values','customer_notes','customer_activities','guardians','student_guardians'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from anon,authenticated',tbl);
 execute format('grant select on public.%I to authenticated',tbl);
 end loop;
end $$;
create policy statuses_read on public.customer_statuses for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy tags_read on public.customer_tags for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy fields_read on public.customer_field_definitions for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy customers_read on public.customers for select to authenticated using(private.customer_allowed(tenant_id,id,'customers.view'));
create policy customer_branches_read on public.customer_branches for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view'));
create policy customer_tags_read on public.customer_tag_links for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view'));
create policy students_read on public.student_profiles for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view'));
create policy values_read on public.customer_field_values for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view'));
create policy notes_read on public.customer_notes for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view') and private.customer_allowed(tenant_id,customer_id,'customers.view_notes'));
create policy activities_read on public.customer_activities for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view') and (not notes_only or private.customer_allowed(tenant_id,customer_id,'customers.view_notes')));
create policy guardians_read on public.guardians for select to authenticated using(private.guardian_allowed(tenant_id,id,'customers.view'));
create policy student_guardians_read on public.student_guardians for select to authenticated using(private.customer_allowed(tenant_id,customer_id,'customers.view'));
