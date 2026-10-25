-- 7A only. Add resources/configuration; retain all CRM, student and money records.
insert into public.permissions(key,description) values
 ('classrooms.view','View classrooms in authorized branches'),
 ('classrooms.manage','Create, edit and deactivate classrooms in authorized branches');
update public.permissions set description='View the shared business course catalog and tuition templates' where key='courses.view';
update public.permissions set description='Manage business-wide courses, categories and levels' where key='courses.manage';
create function private.seed_course_catalog_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin') and p.key in ('classrooms.view','classrooms.manage')) or
 (r.system_key='manager' and p.key in ('courses.view','classrooms.view','classrooms.manage')) or
 (r.system_key='teacher' and p.key='classrooms.view')) on conflict do nothing;return new;
end $$;
revoke all on function private.seed_course_catalog_permissions() from public,anon,authenticated;
create trigger zzzzzzzz_seed_course_catalog after insert on public.tenants for each row execute function private.seed_course_catalog_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 (r.system_key in ('owner','admin') and p.key in ('classrooms.view','classrooms.manage')) or
 (r.system_key='manager' and p.key in ('courses.view','classrooms.view','classrooms.manage')) or
 (r.system_key='teacher' and p.key='classrooms.view') on conflict do nothing;

create table public.course_categories (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 100),is_active boolean not null default true,
 version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id)
);
create unique index course_categories_name on public.course_categories(tenant_id,lower(name));
create table public.course_levels (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 100),is_active boolean not null default true,
 version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id)
);
create unique index course_levels_name on public.course_levels(tenant_id,lower(name));
create table public.courses (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 150),code text check(code is null or length(trim(code)) between 1 and 40),
 description text not null default '' check(length(description)<=6000),category_id uuid,level_id uuid,
 duration_value integer check(duration_value between 1 and 10000),duration_unit text not null default 'weeks' check(duration_unit in ('days','weeks','months','lessons')),
 lesson_duration_minutes integer check(lesson_duration_minutes between 1 and 1440),
 standard_price numeric not null check(standard_price>=0 and standard_price=trunc(standard_price,2) and standard_price<=9999999999999999.99),
 pricing_model text not null check(pricing_model in ('fixed_course','monthly','per_lesson')),currency text not null default 'UZS' references public.finance_currencies(code) check(currency='UZS'),
 is_active boolean not null default true,version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,category_id) references public.course_categories(tenant_id,id),foreign key(tenant_id,level_id) references public.course_levels(tenant_id,id)
);
create unique index courses_code on public.courses(tenant_id,lower(code)) where code is not null;
create index courses_directory on public.courses(tenant_id,is_active,name,id);
create index courses_category on public.courses(tenant_id,category_id);
create index courses_level on public.courses(tenant_id,level_id);
create table public.classrooms (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,branch_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 100),description text not null default '' check(length(description)<=2000),
 capacity integer not null check(capacity between 1 and 10000),is_active boolean not null default true,version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,branch_id),foreign key(tenant_id,branch_id) references public.branches(tenant_id,id)
);
create unique index classrooms_name on public.classrooms(tenant_id,branch_id,lower(name));
create index classrooms_directory on public.classrooms(tenant_id,branch_id,is_active,name,id);
create table public.academic_configuration_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,course_id uuid,classroom_id uuid,category_id uuid,level_id uuid,branch_id uuid,
 request_id uuid not null,request_payload jsonb not null,operation text not null check(operation in ('created','updated','deactivated','reactivated')),
 actor_id uuid not null references auth.users(id),actor_name text not null,reason text not null default '' check(length(reason)<=1000),before_data jsonb,after_data jsonb not null,
 created_at timestamptz not null default now(),unique(tenant_id,request_id),
 check(num_nonnulls(course_id,classroom_id,category_id,level_id)=1),check((classroom_id is not null)=(branch_id is not null)),
 foreign key(tenant_id,course_id) references public.courses(tenant_id,id),foreign key(tenant_id,category_id) references public.course_categories(tenant_id,id),
 foreign key(tenant_id,level_id) references public.course_levels(tenant_id,id),foreign key(tenant_id,classroom_id,branch_id) references public.classrooms(tenant_id,id,branch_id)
);
create index academic_events_course on public.academic_configuration_events(tenant_id,course_id,created_at desc,id);
create index academic_events_room on public.academic_configuration_events(tenant_id,classroom_id,created_at desc,id);
create index academic_events_category on public.academic_configuration_events(tenant_id,category_id,created_at desc,id);
create index academic_events_level on public.academic_configuration_events(tenant_id,level_id,created_at desc,id);
create function private.course_catalog_allowed(t uuid,p text default 'courses.view') returns boolean language sql stable security definer set search_path='' as $$
 select case when p='courses.view' then private.has_permission(t,'courses.view') or exists(select 1 from public.branches b where b.tenant_id=t and private.has_permission(t,'courses.view',b.id))
 when p='courses.manage' then private.has_permission(t,'courses.view') and private.has_permission(t,'courses.manage') else false end;
$$;
create function private.classroom_allowed(t uuid,r uuid,p text default 'classrooms.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms c where c.tenant_id=t and c.id=r and private.has_permission(t,'classrooms.view',c.branch_id) and private.has_permission(t,p,c.branch_id));
$$;
revoke all on function private.course_catalog_allowed(uuid,text),private.classroom_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.course_catalog_allowed(uuid,text),private.classroom_allowed(uuid,uuid,text) to authenticated;
do $$ declare tbl text;begin
 foreach tbl in array array['courses','course_categories','course_levels','classrooms','academic_configuration_events'] loop
  execute format('alter table public.%I enable row level security',tbl);execute format('revoke all on public.%I from public,anon,authenticated',tbl);
 end loop;
end $$;
grant select on public.course_categories,public.course_levels,public.classrooms to authenticated;
-- No raw NUMERIC API reads: the checked catalog queries return price as text.
grant select(id,tenant_id,name,code,description,category_id,level_id,duration_value,duration_unit,lesson_duration_minutes,pricing_model,currency,is_active,version,created_by,created_at,updated_at) on public.courses to authenticated;
create policy courses_read on public.courses for select to authenticated using(private.course_catalog_allowed(tenant_id));
create policy course_categories_read on public.course_categories for select to authenticated using(private.course_catalog_allowed(tenant_id));
create policy course_levels_read on public.course_levels for select to authenticated using(private.course_catalog_allowed(tenant_id));
create policy classrooms_read on public.classrooms for select to authenticated using(private.classroom_allowed(tenant_id,id));
create policy academic_events_read on public.academic_configuration_events for select to authenticated using(
 (classroom_id is not null and private.classroom_allowed(tenant_id,classroom_id,'classrooms.manage')) or
 (classroom_id is null and private.course_catalog_allowed(tenant_id,'courses.manage')));
create function private.academic_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Academic resources are retained; deactivate instead';end if;
 if (new.id,new.tenant_id,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.created_by,old.created_at) then raise exception 'Academic identity cannot change';end if;
 if tg_table_name='classrooms' then if new.branch_id<>old.branch_id then raise exception 'Classroom branch cannot change';end if;end if;
 if tg_table_name='courses' then if new.currency<>old.currency then raise exception 'Course currency cannot change';end if;end if;
 if new.version<>old.version+1 then raise exception 'Academic version must advance once';end if;return new;
end $$;
create function private.academic_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='Academic configuration history is immutable';end $$;
do $$ declare tbl text;begin
 foreach tbl in array array['courses','course_categories','course_levels','classrooms'] loop
  execute format('create trigger academic_identity_guard before update or delete on public.%I for each row execute function private.academic_identity_guard()',tbl);
 end loop;
end $$;
create trigger academic_events_immutable before update or delete on public.academic_configuration_events for each row execute function private.academic_history_immutable();
revoke all on function private.academic_identity_guard(),private.academic_history_immutable() from public,anon,authenticated;
