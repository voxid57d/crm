-- 7B: normalized academic delivery using existing employee and student identities.
insert into public.permissions(key,description) values
 ('groups.view','View groups in authorized branches'),('groups.view_assigned','View only groups assigned to the linked teacher'),
 ('groups.create','Create groups in authorized branches'),('groups.update','Edit groups and change non-archive status'),('groups.archive','Archive terminal groups'),
 ('groups.assign_teachers','Assign eligible employee teachers'),('groups.teach','Eligibility to teach in an assigned branch'),
 ('enrollments.view','Read permitted group enrollments'),('enrollments.create','Enroll existing students'),('enrollments.update','Edit academic enrollment details and lifecycle'),
 ('enrollments.transfer','Transfer enrollments between authorized groups'),('enrollments.withdraw','Withdraw or cancel enrollments'),('enrollments.view_pricing','View and agree confidential enrollment tuition');
create function private.seed_group_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin','manager') and p.key in ('groups.view','groups.create','groups.update','groups.archive','groups.assign_teachers','groups.teach','enrollments.view','enrollments.create','enrollments.update','enrollments.transfer','enrollments.withdraw','enrollments.view_pricing')) or
 (r.system_key='teacher' and p.key in ('groups.view_assigned','groups.teach','enrollments.view'))) on conflict do nothing;return new;
end $$;
create trigger zzzzzzzzz_seed_groups after insert on public.tenants for each row execute function private.seed_group_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 (r.system_key in ('owner','admin','manager') and p.key in ('groups.view','groups.create','groups.update','groups.archive','groups.assign_teachers','groups.teach','enrollments.view','enrollments.create','enrollments.update','enrollments.transfer','enrollments.withdraw','enrollments.view_pricing')) or
 (r.system_key='teacher' and p.key in ('groups.view_assigned','groups.teach','enrollments.view')) on conflict do nothing;

create table public.study_groups (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,branch_id uuid not null,course_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 150),code text check(code is null or length(trim(code)) between 1 and 40),
 start_date date not null,end_date date,capacity integer not null check(capacity between 1 and 10000),
 status text not null default 'planned' check(status in ('planned','active','paused','completed','cancelled','archived')),classroom_id uuid,
 version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,branch_id),check(end_date is null or end_date>=start_date),
 foreign key(tenant_id,branch_id) references public.branches(tenant_id,id),foreign key(tenant_id,course_id) references public.courses(tenant_id,id),
 foreign key(tenant_id,classroom_id,branch_id) references public.classrooms(tenant_id,id,branch_id)
);
create unique index study_groups_code on public.study_groups(tenant_id,branch_id,lower(code)) where code is not null;
create index study_groups_directory on public.study_groups(tenant_id,branch_id,status,name,id);
create index study_groups_course on public.study_groups(tenant_id,course_id,status);
create index study_groups_room on public.study_groups(tenant_id,classroom_id);
create table public.group_teacher_assignments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,employee_id uuid not null,
 is_primary boolean not null,assigned_at timestamptz not null default now(),ended_at timestamptz,
 assigned_by uuid not null references auth.users(id),ended_by uuid references auth.users(id),
 unique(tenant_id,id),foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id),foreign key(tenant_id,employee_id) references public.employees(tenant_id,id),
 check((ended_at is null)=(ended_by is null)),check(ended_at is null or ended_at>=assigned_at)
);
create unique index group_teachers_current on public.group_teacher_assignments(tenant_id,group_id,employee_id) where ended_at is null;
create unique index group_teachers_primary on public.group_teacher_assignments(tenant_id,group_id) where ended_at is null and is_primary;
create index group_teachers_employee on public.group_teacher_assignments(tenant_id,employee_id,group_id,ended_at);
create table public.student_enrollments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,customer_id uuid not null,
 enrollment_date date not null,effective_start_date date not null,effective_end_date date,
 status text not null check(status in ('pending','active','paused','completed','withdrawn','cancelled')),
 agreed_price numeric not null check(agreed_price>=0 and agreed_price=trunc(agreed_price,2) and agreed_price<=9999999999999999.99),
 pricing_model text not null check(pricing_model in ('fixed_course','monthly','per_lesson')),currency text not null default 'UZS' check(currency='UZS') references public.finance_currencies(code),
 notes text not null default '' check(length(notes)<=3000),transferred_from_id uuid,version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,group_id,branch_id),unique(tenant_id,transferred_from_id),
 check(effective_end_date is null or effective_end_date>=effective_start_date),check(transferred_from_id is null or transferred_from_id<>id),
 foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id),
 foreign key(tenant_id,customer_id) references public.student_profiles(tenant_id,customer_id),foreign key(tenant_id,transferred_from_id) references public.student_enrollments(tenant_id,id)
);
create unique index student_enrollments_open on public.student_enrollments(tenant_id,group_id,customer_id) where status in ('pending','active','paused');
create index student_enrollments_group on public.student_enrollments(tenant_id,group_id,status,id);
create index student_enrollments_student on public.student_enrollments(tenant_id,customer_id,created_at desc,id);
create table public.lms_commands (
 tenant_id uuid not null references public.tenants(id),request_id uuid not null,actor_id uuid not null references auth.users(id),payload jsonb not null,result_id uuid not null,
 created_at timestamptz not null default now(),primary key(tenant_id,request_id)
);
create table public.lms_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,branch_id uuid not null,group_id uuid not null,enrollment_id uuid,
 operation text not null,actor_id uuid not null references auth.users(id),actor_name text not null,reason text not null default '' check(length(reason)<=1000),
 before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id),
 foreign key(tenant_id,enrollment_id,group_id,branch_id) references public.student_enrollments(tenant_id,id,group_id,branch_id)
);
create index lms_events_group on public.lms_events(tenant_id,group_id,created_at desc,id) where enrollment_id is null;
create index lms_events_enrollment on public.lms_events(tenant_id,enrollment_id,created_at desc,id);

create function private.employee_can_teach(t uuid,e uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employees x join public.tenant_memberships m on m.tenant_id=x.tenant_id and m.user_id=x.user_id
 join public.business_roles r on r.tenant_id=m.tenant_id and r.id=m.role_id
 where x.tenant_id=t and x.id=e and x.status='active' and private.member_enabled(t,x.user_id)
 and exists(select 1 from public.employee_branches where tenant_id=t and employee_id=e and branch_id=b)
 and exists(select 1 from public.branches where tenant_id=t and id=b and is_active)
 and ((r.scope='business' and exists(select 1 from public.business_role_permissions where tenant_id=t and role_id=r.id and permission='groups.teach'))
 or exists(select 1 from public.branch_memberships bm join public.business_role_permissions p on p.tenant_id=bm.tenant_id and p.role_id=coalesce(bm.role_id,m.role_id)
 where bm.tenant_id=t and bm.user_id=x.user_id and bm.branch_id=b and p.permission='groups.teach')));
$$;
create function private.group_allowed(t uuid,g uuid,p text default 'groups.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_groups x where x.tenant_id=t and x.id=g and
 ((private.has_permission(t,'groups.view',x.branch_id) and private.has_permission(t,p,x.branch_id)) or
 (p='groups.view' and private.has_permission(t,'groups.view_assigned',x.branch_id) and exists(select 1 from public.group_teacher_assignments a join public.employees e on e.tenant_id=a.tenant_id and e.id=a.employee_id
 where a.tenant_id=t and a.group_id=g and a.ended_at is null and e.user_id=auth.uid() and private.employee_can_teach(t,e.id,x.branch_id)))));
$$;
create function private.enrollment_allowed(t uuid,e uuid,p text default 'enrollments.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_enrollments x where x.tenant_id=t and x.id=e and private.group_allowed(t,x.group_id)
 and private.has_permission(t,'enrollments.view',x.branch_id) and private.has_permission(t,p,x.branch_id));
$$;
revoke all on function private.employee_can_teach(uuid,uuid,uuid),private.seed_group_permissions() from public,anon,authenticated;
revoke all on function private.group_allowed(uuid,uuid,text),private.enrollment_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.group_allowed(uuid,uuid,text),private.enrollment_allowed(uuid,uuid,text) to authenticated;
do $$ declare tbl text;begin
 foreach tbl in array array['study_groups','group_teacher_assignments','student_enrollments','lms_commands','lms_events'] loop
 execute format('alter table public.%I enable row level security',tbl);execute format('revoke all on public.%I from public,anon,authenticated',tbl);end loop;
end $$;
grant select on public.study_groups,public.group_teacher_assignments to authenticated;
create policy study_groups_read on public.study_groups for select to authenticated using(private.group_allowed(tenant_id,id));
create policy group_teachers_read on public.group_teacher_assignments for select to authenticated using(private.group_allowed(tenant_id,group_id));
-- Enrollment reads use DTO RPCs: limited rosters for teachers and text-only prices.
create function private.group_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Academic history is retained';end if;
 if (new.id,new.tenant_id,new.branch_id,new.course_id,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.branch_id,old.course_id,old.created_by,old.created_at) then raise exception 'Group identity, course and branch cannot change';end if;
 if new.version<>old.version+1 then raise exception 'Group version must advance once';end if;return new;
end $$;
create trigger study_groups_identity before update or delete on public.study_groups for each row execute function private.group_identity_guard();
create function private.enrollment_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Enrollment history is retained';end if;
 if (new.id,new.tenant_id,new.group_id,new.branch_id,new.customer_id,new.enrollment_date,new.agreed_price,new.pricing_model,new.currency,new.transferred_from_id,new.created_by,new.created_at)
 is distinct from (old.id,old.tenant_id,old.group_id,old.branch_id,old.customer_id,old.enrollment_date,old.agreed_price,old.pricing_model,old.currency,old.transferred_from_id,old.created_by,old.created_at) then raise exception 'Enrollment identity and agreed tuition cannot change';end if;
 if new.version<>old.version+1 then raise exception 'Enrollment version must advance once';end if;return new;
end $$;
create trigger student_enrollments_identity before update or delete on public.student_enrollments for each row execute function private.enrollment_identity_guard();
create function private.teacher_assignment_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Teacher assignment history is retained';end if;
 if old.ended_at is not null or new.ended_at is null or new.ended_by is null or
 (to_jsonb(new)-'ended_at'-'ended_by') is distinct from (to_jsonb(old)-'ended_at'-'ended_by') then raise exception 'Teacher assignments can only be ended once';end if;return new;
end $$;
create trigger teacher_assignments_retained before update or delete on public.group_teacher_assignments for each row execute function private.teacher_assignment_guard();
create trigger lms_events_immutable before update or delete on public.lms_events for each row execute function private.academic_history_immutable();
create trigger lms_commands_immutable before update or delete on public.lms_commands for each row execute function private.academic_history_immutable();
revoke all on function private.group_identity_guard(),private.enrollment_identity_guard(),private.teacher_assignment_guard() from public,anon,authenticated;
