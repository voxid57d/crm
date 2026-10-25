create function public.attendance_sheet_history(p_tenant uuid,p_lesson uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.attendance_allowed(p_tenant,p_lesson) then raise exception using errcode='42501',message='Attendance history denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid attendance history page';end if;
 with rows as materialized(select a.id,a.operation,a.actor_name,a.reason,a.created_at,a.sheet_version,a.record_id,trim(c.first_name||' '||c.last_name) student_name,
  a.before_data,a.after_data from public.attendance_events a left join public.lesson_attendance_records r on r.tenant_id=p_tenant and r.id=a.record_id
  left join public.customers c on c.tenant_id=p_tenant and c.id=r.customer_id where a.tenant_id=p_tenant and a.lesson_id=p_lesson),
 page as(select * from rows order by sheet_version desc,created_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by sheet_version desc,created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
create function public.attendance_sheet_details(p_tenant uuid,p_lesson uuid,p_page integer default 0,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.lessons;s public.lesson_attendance_sheets;result jsonb;counts jsonb;changed boolean:=false;
begin
 if not private.attendance_allowed(p_tenant,p_lesson) then raise exception using errcode='42501',message='Attendance sheet denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid attendance roster page';end if;
 select * into l from public.lessons where tenant_id=p_tenant and id=p_lesson;
 select * into s from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=p_lesson;
 if s.id is null then
  with roster as materialized(select * from private.attendance_roster(p_tenant,p_lesson)),
  rows as(select null::uuid id,r.enrollment_id,r.customer_id,true is_expected,'unmarked'::text status,''::text notes,null::integer late_minutes,null::timestamptz marked_at,
   trim(c.first_name||' '||c.last_name) name,p.student_identifier,private.customer_allowed(p_tenant,c.id,'customers.view') can_open_student
   from roster r join public.customers c on c.tenant_id=p_tenant and c.id=r.customer_id join public.student_profiles p on p.tenant_id=p_tenant and p.customer_id=r.customer_id),
  page as(select * from rows order by lower(name),customer_id limit 20 offset p_page*20)
  select jsonb_build_object('total',(select count(*) from roster),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by lower(name),customer_id) from page),'[]')) into result;
  counts:=jsonb_build_object('expected',result->'total','unmarked',result->'total','excluded',0,'present',0,'absent',0,'late',0,'excused',0);
 else
  with rows as materialized(select r.id,r.enrollment_id,r.customer_id,r.is_expected,r.status,r.notes,r.late_minutes,r.marked_at,
   trim(c.first_name||' '||c.last_name) name,p.student_identifier,private.customer_allowed(p_tenant,c.id,'customers.view') can_open_student
   from public.lesson_attendance_records r join public.customers c on c.tenant_id=p_tenant and c.id=r.customer_id join public.student_profiles p on p.tenant_id=p_tenant and p.customer_id=r.customer_id where r.tenant_id=p_tenant and r.sheet_id=s.id),
  page as(select * from rows order by is_expected desc,lower(name),customer_id limit 20 offset p_page*20)
  select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by is_expected desc,lower(name),customer_id) from page),'[]')) into result;
  counts:=private.attendance_counts(p_tenant,s.id);
  if s.state='draft' and l.status not in ('cancelled','rescheduled') then
   select exists((select enrollment_id,customer_id from private.attendance_roster(p_tenant,p_lesson) except select enrollment_id,customer_id from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and is_expected)
   union all (select enrollment_id,customer_id from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and is_expected except select enrollment_id,customer_id from private.attendance_roster(p_tenant,p_lesson))) into changed;
  end if;
 end if;
 return result||jsonb_build_object('lesson',private.scheduling_document(p_tenant,'lesson',p_lesson),'sheet',case when s.id is null then null else to_jsonb(s) end,'counts',counts,'roster_changed',changed,
  'can_manage',private.attendance_allowed(p_tenant,p_lesson,'attendance.manage') and l.starts_at<=now() and l.status not in ('cancelled','rescheduled') and (s.id is null or s.state='draft'),
  'can_finalize',s.state='draft' and private.attendance_allowed(p_tenant,p_lesson,'attendance.finalize') and l.ends_at<=now() and l.status not in ('cancelled','rescheduled'),
  'can_correct',s.state='finalized' and private.attendance_allowed(p_tenant,p_lesson,'attendance.correct') and l.status not in ('cancelled','rescheduled'),
  'history',public.attendance_sheet_history(p_tenant,p_lesson,p_history_page));
end $$;

create function public.attendance_options(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid;
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'attendance.view',id) and private.has_permission(p_tenant,'lessons.view',id) and private.has_permission(p_tenant,'enrollments.view',id)) then raise exception using errcode='42501',message='Attendance workspace denied';end if;
 select id into me from public.employees where tenant_id=p_tenant and user_id=auth.uid() and status='active';
 return jsonb_build_object('my_employee_id',me,'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'course_id',g.course_id,'course_name',c.name,'branch_id',g.branch_id) order by lower(g.name),g.id)
  from public.study_groups g join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id where g.tenant_id=p_tenant and
  (private.group_allowed(p_tenant,g.id) and private.has_permission(p_tenant,'attendance.view',g.branch_id) or exists(select 1 from public.lessons l where l.tenant_id=p_tenant and l.group_id=g.id and private.attendance_allowed(p_tenant,l.id)))),'[]'),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name) order by lower(e.full_name),e.id) from public.employees e where e.tenant_id=p_tenant and exists(select 1 from public.lessons l where l.tenant_id=p_tenant and l.effective_teacher_id=e.id and private.attendance_allowed(p_tenant,l.id))),'[]'),
 'assigned_groups',coalesce((select jsonb_agg(x order by lower(x.name),x.id) from (select g.id,g.name from public.study_groups g where g.tenant_id=p_tenant and g.status in ('planned','active','paused') and private.group_allowed(p_tenant,g.id)
  and exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.group_id=g.id and a.employee_id=me and a.ended_at is null and private.employee_can_teach(p_tenant,me,g.branch_id)) order by lower(g.name),g.id limit 20) x),'[]'));
end $$;

create function public.attendance_lesson_directory(p_tenant uuid,p_filters jsonb,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;zone text;mode text:=coalesce(nullif(p_filters->>'view',''),'today');sorting text:=coalesce(nullif(p_filters->>'sort',''),'start');v_branch uuid;v_group uuid;v_course uuid;v_teacher uuid;result jsonb;
begin
 perform public.attendance_options(p_tenant);
 select timezone into zone from public.tenants where id=p_tenant;
 first_day:=private.lms_date(p_filters->>'from');last_day:=private.lms_date(p_filters->>'to');
 if p_page is null or p_page not between 0 and 100000 or last_day<first_day or last_day-first_day>365 or mode not in ('today','upcoming','awaiting','recent','all') or sorting not in ('start','newest') then raise exception 'Invalid attendance workspace filters';end if;
 v_branch:=nullif(p_filters->>'branch','')::uuid;v_group:=nullif(p_filters->>'group','')::uuid;v_course:=nullif(p_filters->>'course','')::uuid;v_teacher:=nullif(p_filters->>'teacher','')::uuid;
 with rows as materialized(select l.id,l.group_id,l.branch_id,l.starts_at,l.ends_at,l.timezone,l.title,l.status,g.name group_name,c.name course_name,b.name branch_name,e.full_name teacher_name,r.name classroom_name,
  s.id sheet_id,s.state attendance_state,s.finalized_at,
  case when s.id is not null then (select count(*) from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and is_expected) end expected,
  case when s.id is not null then (select count(*) from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and is_expected and status='unmarked') end unmarked,
  private.attendance_allowed(p_tenant,l.id,'attendance.manage') can_manage
  from public.lessons l join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id
  join public.branches b on b.tenant_id=p_tenant and b.id=l.branch_id join public.employees e on e.tenant_id=p_tenant and e.id=l.effective_teacher_id
  left join public.classrooms r on r.tenant_id=p_tenant and r.id=l.classroom_id left join public.lesson_attendance_sheets s on s.tenant_id=p_tenant and s.lesson_id=l.id
  where l.tenant_id=p_tenant and private.attendance_allowed(p_tenant,l.id) and l.starts_at<((last_day+1)::timestamp at time zone zone) and l.ends_at>(first_day::timestamp at time zone zone)
  and (v_branch is null or l.branch_id=v_branch) and (v_group is null or l.group_id=v_group) and (v_course is null or g.course_id=v_course) and (v_teacher is null or l.effective_teacher_id=v_teacher)
  and (mode='all' or mode='today' and l.status not in ('cancelled','rescheduled') or mode='upcoming' and l.status='scheduled' and l.starts_at>now()
   or mode='awaiting' and l.starts_at<=now() and l.status not in ('cancelled','rescheduled') and (s.id is null or s.state='draft') or mode='recent' and l.status='completed')),
 page as(select * from rows order by case when sorting='newest' then starts_at end desc,starts_at,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by case when sorting='newest' then starts_at end desc,starts_at,id) from page),'[]')) into result;return result;
end $$;

create function public.attendance_record_directory(p_tenant uuid,p_filters jsonb,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;zone text;v_branch uuid;v_group uuid;v_course uuid;v_teacher uuid;v_student uuid;v_status text:=coalesce(nullif(p_filters->>'status',''),'all');v_sheet text:=coalesce(nullif(p_filters->>'sheet',''),'all');sorting text:=coalesce(nullif(p_filters->>'sort',''),'newest');result jsonb;
begin
 perform public.attendance_options(p_tenant);
 select timezone into zone from public.tenants where id=p_tenant;
 first_day:=private.lms_date(p_filters->>'from');last_day:=private.lms_date(p_filters->>'to');
 if p_page is null or p_page not between 0 and 100000 or last_day<first_day or last_day-first_day>365 or v_status not in ('all','unmarked','present','absent','late','excused') or v_sheet not in ('all','draft','finalized') or sorting not in ('newest','oldest') or length(coalesce(p_filters->>'q',''))>100 then raise exception 'Invalid attendance history filters';end if;
 v_branch:=nullif(p_filters->>'branch','')::uuid;v_group:=nullif(p_filters->>'group','')::uuid;v_course:=nullif(p_filters->>'course','')::uuid;v_teacher:=nullif(p_filters->>'teacher','')::uuid;v_student:=nullif(p_filters->>'student','')::uuid;
 with rows as materialized(select a.id,a.lesson_id,a.customer_id,a.enrollment_id,a.status,a.notes,a.late_minutes,a.marked_at,a.is_expected,s.state sheet_state,l.starts_at,l.ends_at,l.status lesson_status,
  g.name group_name,c.name course_name,b.name branch_name,e.full_name teacher_name,trim(person.first_name||' '||person.last_name) student_name,p.student_identifier,
  private.customer_allowed(p_tenant,a.customer_id,'customers.view') can_open_student
  from public.lesson_attendance_records a join public.lesson_attendance_sheets s on s.tenant_id=p_tenant and s.id=a.sheet_id join public.lessons l on l.tenant_id=p_tenant and l.id=a.lesson_id
  join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id join public.branches b on b.tenant_id=p_tenant and b.id=l.branch_id
  join public.employees e on e.tenant_id=p_tenant and e.id=l.effective_teacher_id join public.customers person on person.tenant_id=p_tenant and person.id=a.customer_id join public.student_profiles p on p.tenant_id=p_tenant and p.customer_id=a.customer_id
  where a.tenant_id=p_tenant and private.attendance_allowed(p_tenant,l.id) and l.starts_at<((last_day+1)::timestamp at time zone zone) and l.ends_at>(first_day::timestamp at time zone zone)
  and (v_branch is null or l.branch_id=v_branch) and (v_group is null or l.group_id=v_group) and (v_course is null or g.course_id=v_course) and (v_teacher is null or l.effective_teacher_id=v_teacher)
  and (v_student is null or a.customer_id=v_student) and (v_status='all' or a.status=v_status) and (v_sheet='all' or s.state=v_sheet)
  and position(lower(coalesce(p_filters->>'q','')) in lower(person.first_name||' '||person.last_name||' '||p.student_identifier))>0),
 page as(select * from rows order by case when sorting='newest' then starts_at end desc,starts_at,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by case when sorting='newest' then starts_at end desc,starts_at,id) from page),'[]')) into result;return result;
end $$;
revoke all on function public.attendance_sheet_history(uuid,uuid,integer),public.attendance_sheet_details(uuid,uuid,integer,integer),public.attendance_options(uuid),public.attendance_lesson_directory(uuid,jsonb,integer),public.attendance_record_directory(uuid,jsonb,integer) from public,anon;
grant execute on function public.attendance_sheet_history(uuid,uuid,integer),public.attendance_sheet_details(uuid,uuid,integer,integer),public.attendance_options(uuid),public.attendance_lesson_directory(uuid,jsonb,integer),public.attendance_record_directory(uuid,jsonb,integer) to authenticated;
