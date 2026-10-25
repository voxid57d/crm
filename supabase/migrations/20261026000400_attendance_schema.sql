-- 8A: attendance references existing lessons, enrollment and Student Profile identities.
insert into public.permissions(key,description) values
 ('attendance.finalize','Finalize a fully marked attendance sheet'),
 ('attendance.correct','Correct finalized attendance with an audited reason');
create function private.seed_attendance_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=new.id and
 ((r.system_key in ('owner','admin','manager') and p.key in ('attendance.view','attendance.manage','attendance.finalize','attendance.correct')) or
 (r.system_key='teacher' and p.key in ('attendance.view','attendance.manage','attendance.finalize'))) on conflict do nothing;
 return new;
end $$;
create trigger zzzzzzzzzzz_seed_attendance after insert on public.tenants for each row execute function private.seed_attendance_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.id,p.key from public.business_roles r cross join public.permissions p where
 (r.system_key in ('owner','admin','manager') and p.key in ('attendance.view','attendance.manage','attendance.finalize','attendance.correct')) or
 (r.system_key='teacher' and p.key in ('attendance.view','attendance.manage','attendance.finalize')) on conflict do nothing;
revoke all on function private.seed_attendance_permissions() from public,anon,authenticated;

create table public.lesson_attendance_sheets (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,lesson_id uuid not null,group_id uuid not null,branch_id uuid not null,
 state text not null default 'draft' check(state in ('draft','finalized')),version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 roster_reviewed_at timestamptz not null default now(),finalized_at timestamptz,finalized_by uuid references auth.users(id),
 correction_count integer not null default 0 check(correction_count>=0),corrected_at timestamptz,corrected_by uuid references auth.users(id),
 unique(tenant_id,id),unique(tenant_id,lesson_id),unique(tenant_id,id,lesson_id,group_id,branch_id),
 foreign key(tenant_id,lesson_id,group_id,branch_id) references public.lessons(tenant_id,id,group_id,branch_id),
 check((state='finalized')=(finalized_at is not null)),check((finalized_at is null)=(finalized_by is null)),
 check((correction_count=0)=(corrected_at is null)),check((corrected_at is null)=(corrected_by is null))
);
create table public.lesson_attendance_records (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,sheet_id uuid not null,lesson_id uuid not null,group_id uuid not null,branch_id uuid not null,
 customer_id uuid not null,enrollment_id uuid not null,is_expected boolean not null default true,
 status text not null default 'unmarked' check(status in ('unmarked','present','absent','late','excused')),
 notes text not null default '' check(length(notes)<=1000),late_minutes integer check(late_minutes between 1 and 1440),
 marked_by uuid references auth.users(id),marked_employee_id uuid,marked_at timestamptz,
 updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,lesson_id,customer_id),
 foreign key(tenant_id,sheet_id,lesson_id,group_id,branch_id) references public.lesson_attendance_sheets(tenant_id,id,lesson_id,group_id,branch_id),
 foreign key(tenant_id,enrollment_id,customer_id,group_id,branch_id) references public.student_enrollments(tenant_id,id,customer_id,group_id,branch_id),
 foreign key(tenant_id,marked_employee_id) references public.employees(tenant_id,id),
 check(late_minutes is null or status='late'),check((status='unmarked')=(marked_by is null)),check((marked_by is null)=(marked_at is null)),
 check(is_expected or status='unmarked')
);
create index attendance_records_student on public.lesson_attendance_records(tenant_id,customer_id,lesson_id);
create index attendance_records_sheet on public.lesson_attendance_records(tenant_id,sheet_id,is_expected,id);
create table public.attendance_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,sheet_id uuid not null,lesson_id uuid not null,group_id uuid not null,branch_id uuid not null,record_id uuid,sheet_version integer not null,
 operation text not null check(operation in ('prepared','draft_saved','roster_refreshed','finalized','corrected')),
 actor_id uuid not null references auth.users(id),actor_name text not null,reason text not null default '' check(length(reason)<=1000),
 before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,sheet_id,lesson_id,group_id,branch_id) references public.lesson_attendance_sheets(tenant_id,id,lesson_id,group_id,branch_id),
 foreign key(tenant_id,record_id) references public.lesson_attendance_records(tenant_id,id)
);
create index attendance_events_sheet on public.attendance_events(tenant_id,sheet_id,created_at desc,id);

create function private.attendance_allowed(t uuid,l uuid,p text default 'attendance.view') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lessons x where x.tenant_id=t and x.id=l
 and private.has_permission(t,'attendance.view',x.branch_id) and private.has_permission(t,p,x.branch_id)
 and private.has_permission(t,'enrollments.view',x.branch_id) and private.lesson_allowed(t,x.id)
 and (private.has_permission(t,'groups.view',x.branch_id) or exists(select 1 from public.employees e where e.tenant_id=t and e.user_id=auth.uid()
  and private.employee_can_teach(t,e.id,x.branch_id) and (e.id=x.effective_teacher_id or p='attendance.view' and e.id=x.teacher_id))));
$$;
revoke all on function private.attendance_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.attendance_allowed(uuid,uuid,text) to authenticated;
alter table public.lesson_attendance_sheets enable row level security;
alter table public.lesson_attendance_records enable row level security;
alter table public.attendance_events enable row level security;
revoke all on public.lesson_attendance_sheets,public.lesson_attendance_records,public.attendance_events from public,anon,authenticated;
grant select on public.lesson_attendance_sheets,public.lesson_attendance_records to authenticated;
create policy attendance_sheets_read on public.lesson_attendance_sheets for select to authenticated using(private.attendance_allowed(tenant_id,lesson_id));
create policy attendance_records_read on public.lesson_attendance_records for select to authenticated using(private.attendance_allowed(tenant_id,lesson_id));
create trigger attendance_events_immutable before update or delete on public.attendance_events for each row execute function private.academic_history_immutable();

-- Enrollment audits contain retained status/version snapshots. First activation honors
-- the contractual start date; subsequent pause/resume changes apply from their recorded instant.
create function private.attendance_roster(t uuid,l uuid) returns table(enrollment_id uuid,customer_id uuid) language plpgsql stable security definer set search_path='' as $$
declare lesson public.lessons;
begin
 select * into lesson from public.lessons where tenant_id=t and id=l;
 if not found then raise exception 'Lesson does not exist';end if;
 if exists(select 1 from public.student_enrollments e where e.tenant_id=t and e.group_id=lesson.group_id and e.status<>'cancelled'
  and e.effective_start_date<=(lesson.starts_at at time zone lesson.timezone)::date and (e.effective_end_date is null or e.effective_end_date>=(lesson.starts_at at time zone lesson.timezone)::date)
  and not exists(select 1 from public.lms_events a where a.tenant_id=t and a.enrollment_id=e.id and a.after_data->>'status' in ('pending','active','paused','completed','withdrawn','cancelled')))
 then raise exception 'Enrollment activation history is missing; review the enrollment audit before preparing attendance';end if;
 return query
 with eligible as(select e.id,e.customer_id,e.effective_start_date,e.created_at,
  (select a.after_data->>'status' from public.lms_events a where a.tenant_id=t and a.enrollment_id=e.id and a.after_data->>'status' in ('active','paused')
   and (a.created_at<=lesson.starts_at or (a.after_data->>'version')::integer=(select min((v.after_data->>'version')::integer) from public.lms_events v where v.tenant_id=t and v.enrollment_id=e.id and v.after_data->>'status'='active'))
   order by (a.after_data->>'version')::integer desc,a.created_at desc,a.id desc limit 1) lesson_state
  from public.student_enrollments e where e.tenant_id=t and e.group_id=lesson.group_id and e.status<>'cancelled'
  and e.effective_start_date<=(lesson.starts_at at time zone lesson.timezone)::date and (e.effective_end_date is null or e.effective_end_date>=(lesson.starts_at at time zone lesson.timezone)::date))
 select distinct on(e.customer_id) e.id,e.customer_id from eligible e where lesson_state='active' order by e.customer_id,e.effective_start_date desc,e.created_at desc,e.id;
end $$;
revoke all on function private.attendance_roster(uuid,uuid) from public,anon,authenticated;

create function private.attendance_sheet_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Attendance history is retained';end if;
 if tg_op='UPDATE' then
  if (new.id,new.tenant_id,new.lesson_id,new.group_id,new.branch_id,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.lesson_id,old.group_id,old.branch_id,old.created_by,old.created_at) or new.version<>old.version+1 then raise exception 'Attendance sheet identity is immutable and its version must advance once';end if;
  if old.state='finalized' and (new.state<>'finalized' or new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by or new.roster_reviewed_at is distinct from old.roster_reviewed_at or new.correction_count<>old.correction_count+1 or not private.attendance_allowed(new.tenant_id,new.lesson_id,'attendance.correct')) then raise exception 'Finalized attendance requires an authorized audited correction';end if;
 end if;return new;
end $$;
create function private.attendance_record_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare state text;
begin
 if tg_op='DELETE' then raise exception 'Attendance history is retained';end if;
 select s.state into state from public.lesson_attendance_sheets s where s.tenant_id=new.tenant_id and s.id=new.sheet_id;
 if tg_op='INSERT' then if state is distinct from 'draft' or new.status<>'unmarked' then raise exception 'New roster rows start unmarked in a draft sheet';end if;
 else
  if (new.id,new.tenant_id,new.sheet_id,new.lesson_id,new.group_id,new.branch_id,new.customer_id,new.created_at) is distinct from (old.id,old.tenant_id,old.sheet_id,old.lesson_id,old.group_id,old.branch_id,old.customer_id,old.created_at) then raise exception 'Attendance student and lesson identities are immutable';end if;
  if (new.enrollment_id,new.is_expected) is distinct from (old.enrollment_id,old.is_expected) and (state<>'draft' or old.status<>'unmarked' or new.status<>'unmarked') then raise exception 'Only unmarked draft roster references may be reviewed';end if;
  if state='finalized' and not private.attendance_allowed(new.tenant_id,new.lesson_id,'attendance.correct') then raise exception 'Finalized attendance requires correction permission';end if;
 end if;return new;
end $$;
create function private.attendance_lesson_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('cancelled','rescheduled') and new.status is distinct from old.status and exists(select 1 from public.lesson_attendance_sheets where tenant_id=new.tenant_id and lesson_id=new.id and state='finalized') then raise exception 'Finalized attendance prevents lesson cancellation or rescheduling';end if;return new;
end $$;
create trigger attendance_sheet_guard before insert or update or delete on public.lesson_attendance_sheets for each row execute function private.attendance_sheet_guard();
create trigger attendance_record_guard before insert or update or delete on public.lesson_attendance_records for each row execute function private.attendance_record_guard();
create trigger attendance_lesson_guard before update on public.lessons for each row execute function private.attendance_lesson_guard();
revoke all on function private.attendance_sheet_guard(),private.attendance_record_guard(),private.attendance_lesson_guard() from public,anon,authenticated;
