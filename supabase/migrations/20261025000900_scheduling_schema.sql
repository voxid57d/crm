-- 7C uses existing group, employee, branch and Student Profile identities.
insert into public.permissions(key,description) values
 ('schedules.view','View weekly schedules and timetable in authorized scope'),('schedules.manage','Create, revise, end schedules and generate lessons'),
 ('lessons.complete','Start and complete authorized teaching lessons');
update public.permissions set description='Create, edit, cancel, reschedule and assign substitutes to authorized lessons' where key='lessons.manage';
create function private.seed_scheduling_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin','manager') and p.key in ('schedules.view','schedules.manage','lessons.view','lessons.manage','lessons.complete')) or
 (r.system_key='teacher' and p.key in ('schedules.view','lessons.complete'))) on conflict do nothing;return new;
end $$;
create trigger zzzzzzzzzz_seed_scheduling after insert on public.tenants for each row execute function private.seed_scheduling_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 (r.system_key in ('owner','admin','manager') and p.key in ('schedules.view','schedules.manage','lessons.view','lessons.manage','lessons.complete')) or
 (r.system_key='teacher' and p.key in ('schedules.view','lessons.complete')) on conflict do nothing;
create table public.group_schedule_series (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(tenant_id,id,group_id,branch_id),foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id)
);
create table public.group_schedule_slots (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,series_id uuid not null,group_id uuid not null,branch_id uuid not null,
 weekday integer not null check(weekday between 1 and 7),start_time time not null,end_time time not null,
 timezone text not null check(length(timezone) between 1 and 100),effective_from date not null,effective_to date not null,
 teacher_id uuid not null,classroom_id uuid,is_active boolean not null default true,replaces_id uuid,
 version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,series_id,group_id,branch_id),unique(tenant_id,replaces_id),
 check(end_time>start_time),check(effective_to>=effective_from and effective_to-effective_from<=365),check(replaces_id is null or replaces_id<>id),
 foreign key(tenant_id,series_id,group_id,branch_id) references public.group_schedule_series(tenant_id,id,group_id,branch_id),
 foreign key(tenant_id,teacher_id) references public.employees(tenant_id,id),foreign key(tenant_id,classroom_id,branch_id) references public.classrooms(tenant_id,id,branch_id),
 foreign key(tenant_id,replaces_id) references public.group_schedule_slots(tenant_id,id)
);
create index schedule_slots_group on public.group_schedule_slots(tenant_id,group_id,effective_from,effective_to);
create index schedule_slots_teacher on public.group_schedule_slots(tenant_id,teacher_id,effective_from,effective_to) where is_active;
create index schedule_slots_room on public.group_schedule_slots(tenant_id,classroom_id,effective_from,effective_to) where is_active;
create table public.lessons (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,
 starts_at timestamptz not null,ends_at timestamptz not null,timezone text not null check(length(timezone) between 1 and 100),
 teacher_id uuid not null,substitute_id uuid,effective_teacher_id uuid generated always as (coalesce(substitute_id,teacher_id)) stored,classroom_id uuid,
 title text not null check(length(trim(title)) between 1 and 200),notes text not null default '' check(length(notes)<=5000),
 status text not null default 'scheduled' check(status in ('scheduled','in_progress','completed','cancelled','rescheduled')),
 series_id uuid,schedule_slot_id uuid,occurrence_date date,schedule_version integer,rescheduled_from_id uuid,
 roster_captured_at timestamptz,version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,id,group_id,branch_id),unique(tenant_id,rescheduled_from_id),
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at-starts_at<=interval '24 hours'),check(substitute_id is null or substitute_id<>teacher_id),check(rescheduled_from_id is null or rescheduled_from_id<>id),
 check((series_id is null and schedule_slot_id is null and occurrence_date is null and schedule_version is null) or (series_id is not null and schedule_slot_id is not null and occurrence_date is not null and schedule_version>0)),
 foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id),
 foreign key(tenant_id,teacher_id) references public.employees(tenant_id,id),foreign key(tenant_id,substitute_id) references public.employees(tenant_id,id),
 foreign key(tenant_id,classroom_id,branch_id) references public.classrooms(tenant_id,id,branch_id),
 foreign key(tenant_id,schedule_slot_id,series_id,group_id,branch_id) references public.group_schedule_slots(tenant_id,id,series_id,group_id,branch_id),
 foreign key(tenant_id,rescheduled_from_id,group_id,branch_id) references public.lessons(tenant_id,id,group_id,branch_id)
);
create unique index lessons_occurrence on public.lessons(tenant_id,series_id,occurrence_date) where series_id is not null and rescheduled_from_id is null;
create index lessons_group_time on public.lessons(tenant_id,group_id,starts_at,ends_at);
create index lessons_teacher_time on public.lessons(tenant_id,effective_teacher_id,starts_at,ends_at) where status in ('scheduled','in_progress','completed');
create index lessons_room_time on public.lessons(tenant_id,classroom_id,starts_at,ends_at) where status in ('scheduled','in_progress','completed');
create index lessons_directory on public.lessons(tenant_id,branch_id,starts_at,id);
alter table public.student_enrollments add constraint enrollment_roster_identity unique(tenant_id,id,customer_id,group_id,branch_id);
create table public.lesson_expected_students (
 tenant_id uuid not null,lesson_id uuid not null,group_id uuid not null,branch_id uuid not null,enrollment_id uuid not null,customer_id uuid not null,
 primary key(tenant_id,lesson_id,enrollment_id),unique(tenant_id,lesson_id,customer_id),
 foreign key(tenant_id,lesson_id,group_id,branch_id) references public.lessons(tenant_id,id,group_id,branch_id),
 foreign key(tenant_id,enrollment_id,customer_id,group_id,branch_id) references public.student_enrollments(tenant_id,id,customer_id,group_id,branch_id)
);
create table public.scheduling_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,slot_id uuid,lesson_id uuid,
 operation text not null,actor_id uuid not null references auth.users(id),actor_name text not null,reason text not null default '' check(length(reason)<=1000),
 before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now(),
 check(num_nonnulls(slot_id,lesson_id)=1),foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id),
 foreign key(tenant_id,slot_id) references public.group_schedule_slots(tenant_id,id),foreign key(tenant_id,lesson_id) references public.lessons(tenant_id,id)
);
create index scheduling_events_slot on public.scheduling_events(tenant_id,slot_id,created_at desc,id);
create index scheduling_events_lesson on public.scheduling_events(tenant_id,lesson_id,created_at desc,id);
create function private.schedule_allowed(t uuid,g uuid,p text default 'schedules.view') returns boolean language sql stable security definer set search_path='' as $$
 select private.group_allowed(t,g) and exists(select 1 from public.study_groups where tenant_id=t and id=g and private.has_permission(t,'schedules.view',branch_id) and private.has_permission(t,p,branch_id));
$$;
create function private.lesson_allowed(t uuid,l uuid,p text default 'lessons.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lessons x where x.tenant_id=t and x.id=l and private.has_permission(t,'lessons.view',x.branch_id) and private.has_permission(t,p,x.branch_id) and
 (private.group_allowed(t,x.group_id) or (p in ('lessons.view','lessons.complete') and exists(select 1 from public.employees e where e.tenant_id=t and e.user_id=auth.uid() and e.id in (x.teacher_id,x.substitute_id) and private.employee_can_teach(t,e.id,x.branch_id)))));
$$;
revoke all on function private.seed_scheduling_permissions() from public,anon,authenticated;
revoke all on function private.schedule_allowed(uuid,uuid,text),private.lesson_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.schedule_allowed(uuid,uuid,text),private.lesson_allowed(uuid,uuid,text) to authenticated;
do $$ declare tbl text;begin
 foreach tbl in array array['group_schedule_series','group_schedule_slots','lessons','lesson_expected_students','scheduling_events'] loop
 execute format('alter table public.%I enable row level security',tbl);execute format('revoke all on public.%I from public,anon,authenticated',tbl);end loop;
end $$;
grant select on public.group_schedule_series,public.group_schedule_slots,public.lessons to authenticated;
create policy schedule_series_read on public.group_schedule_series for select to authenticated using(private.schedule_allowed(tenant_id,group_id));
create policy schedule_slots_read on public.group_schedule_slots for select to authenticated using(private.schedule_allowed(tenant_id,group_id));
create policy lessons_read on public.lessons for select to authenticated using(private.lesson_allowed(tenant_id,id));
create trigger schedule_series_immutable before update or delete on public.group_schedule_series for each row execute function private.academic_history_immutable();
create trigger expected_students_immutable before update or delete on public.lesson_expected_students for each row execute function private.academic_history_immutable();
create trigger scheduling_events_immutable before update or delete on public.scheduling_events for each row execute function private.academic_history_immutable();
