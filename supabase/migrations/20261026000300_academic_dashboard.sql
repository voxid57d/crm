-- Read-only operational reporting. No financial amounts or new permission engine.
create function public.academic_report_options(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and (private.has_permission(p_tenant,'groups.view',id) or private.has_permission(p_tenant,'groups.view_assigned',id))) then raise exception using errcode='42501',message='Academic reporting denied';end if;
 return jsonb_build_object('courses',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by lower(c.name),c.id) from public.courses c where c.tenant_id=p_tenant
  and exists(select 1 from public.study_groups g where g.tenant_id=p_tenant and g.course_id=c.id and private.group_allowed(p_tenant,g.id))),'[]'),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name) order by lower(e.full_name),e.id) from public.employees e where e.tenant_id=p_tenant and (
  exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.employee_id=e.id and a.ended_at is null and private.group_allowed(p_tenant,a.group_id))
  or exists(select 1 from public.lessons l where l.tenant_id=p_tenant and l.effective_teacher_id=e.id and private.lesson_allowed(p_tenant,l.id)))),'[]'));
end $$;

create function public.academic_overview(p_tenant uuid,p_filters jsonb,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;today date;zone text;v_branch uuid;v_course uuid;v_teacher uuid;result jsonb;capacity_filter text:=coalesce(nullif(p_filters->>'capacity',''),'all');
begin
 perform public.academic_report_options(p_tenant);
 if p_page is null or p_page not between 0 and 100000 or capacity_filter not in ('all','near','full') then raise exception 'Invalid academic report page or capacity filter';end if;
 select timezone,(now() at time zone timezone)::date into zone,today from public.tenants where id=p_tenant;
 first_day:=private.lms_date(p_filters->>'from');last_day:=private.lms_date(p_filters->>'to');
 if last_day<first_day or last_day-first_day>365 then raise exception 'Choose an academic date range of at most 366 dates';end if;
 v_branch:=nullif(p_filters->>'branch','')::uuid;v_course:=nullif(p_filters->>'course','')::uuid;v_teacher:=nullif(p_filters->>'teacher','')::uuid;
 with groups as materialized(select g.*,c.name course_name,c.is_active course_active,b.name branch_name,
  private.has_permission(p_tenant,'enrollments.view',g.branch_id) can_roster,
  (select count(*) from public.student_enrollments e where e.tenant_id=p_tenant and e.group_id=g.id and e.status in ('pending','active','paused')) reserved_seats,
  coalesce((select string_agg(e.full_name,', ' order by a.is_primary desc,e.full_name,a.id) from public.group_teacher_assignments a join public.employees e on e.tenant_id=p_tenant and e.id=a.employee_id where a.tenant_id=p_tenant and a.group_id=g.id and a.ended_at is null),'') teachers
  from public.study_groups g join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id join public.branches b on b.tenant_id=p_tenant and b.id=g.branch_id
  where g.tenant_id=p_tenant and private.group_allowed(p_tenant,g.id) and (v_branch is null or g.branch_id=v_branch) and (v_course is null or g.course_id=v_course)
  and g.start_date<=last_day and (g.end_date is null or g.end_date>=first_day)
  and (v_teacher is null or exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.group_id=g.id and a.employee_id=v_teacher and a.ended_at is null))),
 enrollments as materialized(select e.* from public.student_enrollments e join groups g on g.id=e.group_id where e.tenant_id=p_tenant and private.enrollment_allowed(p_tenant,e.id)
  and e.status='active' and e.effective_start_date<=last_day and (e.effective_end_date is null or e.effective_end_date>=first_day)),
 lessons as materialized(select l.* from public.lessons l join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id where l.tenant_id=p_tenant
  and private.lesson_allowed(p_tenant,l.id) and (v_branch is null or l.branch_id=v_branch) and (v_course is null or g.course_id=v_course)
  and (v_teacher is null or l.effective_teacher_id=v_teacher) and l.starts_at<((last_day+1)::timestamp at time zone zone) and l.ends_at>(first_day::timestamp at time zone zone)),
 report as materialized(select id,name,branch_name,course_name,status,capacity,teachers,
  case when can_roster then reserved_seats end reserved_seats,
  case when can_roster then (select count(*) from enrollments e where e.group_id=groups.id) end active_enrollments
  from groups where capacity_filter='all' or can_roster and status in ('planned','active','paused') and
  (capacity_filter='full' and reserved_seats>=capacity or capacity_filter='near' and reserved_seats>=ceil(capacity*0.8) and reserved_seats<capacity)),
 page as(select * from report order by lower(name),id limit 20 offset p_page*20)
 select jsonb_build_object('stats',jsonb_build_object(
  'active_courses',(select count(distinct course_id) from groups where course_active and status in ('planned','active','paused')),
  'active_groups',(select count(*) from groups where status='active'),
  'unique_active_students',(select count(distinct customer_id) from enrollments),
  'active_enrollments',(select count(*) from enrollments),
  'teachers',(select count(distinct a.employee_id) from public.group_teacher_assignments a join groups g on g.id=a.group_id where a.tenant_id=p_tenant and a.ended_at is null
    and g.status in ('planned','active','paused') and private.employee_can_teach(p_tenant,a.employee_id,g.branch_id) and (v_teacher is null or a.employee_id=v_teacher)),
  'today_lessons',(select count(*) from lessons where (starts_at at time zone zone)::date=today and status in ('scheduled','in_progress','completed')),
  'upcoming_lessons',(select count(*) from lessons where starts_at>now() and status='scheduled'),
  'completed_lessons',(select count(*) from lessons where status='completed'),
  'near_capacity',(select count(*) from groups where can_roster and status in ('planned','active','paused') and reserved_seats>=ceil(capacity*0.8) and reserved_seats<capacity),
  'at_capacity',(select count(*) from groups where can_roster and status in ('planned','active','paused') and reserved_seats>=capacity),
  'available_classrooms',(select count(*) from public.classrooms r where r.tenant_id=p_tenant and r.is_active and private.classroom_allowed(p_tenant,r.id)
   and exists(select 1 from public.branches b where b.tenant_id=p_tenant and b.id=r.branch_id and b.is_active) and (v_branch is null or r.branch_id=v_branch)
   and ((v_course is null and v_teacher is null) or exists(select 1 from groups g where g.branch_id=r.branch_id)))),
  'total',(select count(*) from report),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by lower(name),id) from page),'[]')) into result;
 return result;
end $$;
revoke all on function public.academic_report_options(uuid),public.academic_overview(uuid,jsonb,integer) from public,anon;
grant execute on function public.academic_report_options(uuid),public.academic_overview(uuid,jsonb,integer) to authenticated;
