create function public.scheduling_history(p_tenant uuid,p_kind text,p_id uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;g uuid;
begin
 if p_kind='slot' then select group_id into g from public.group_schedule_slots where tenant_id=p_tenant and id=p_id;
 if g is null or not private.schedule_allowed(p_tenant,g) then raise exception using errcode='42501',message='Schedule history denied';end if;
 elsif p_kind='lesson' then if not private.lesson_allowed(p_tenant,p_id) then raise exception using errcode='42501',message='Lesson history denied';end if;
 else raise exception 'Invalid scheduling history kind';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid history page';end if;
 with rows as materialized(select id,operation,actor_name,reason,before_data,after_data,created_at from public.scheduling_events where tenant_id=p_tenant and case p_kind when 'slot' then slot_id=p_id else lesson_id=p_id end),
 page as(select * from rows order by created_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
create function public.scheduling_options(p_tenant uuid,p_group uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.study_groups;manage boolean;
begin
 select * into g from public.study_groups where tenant_id=p_tenant and id=p_group;
 if not found or not private.group_allowed(p_tenant,p_group) or not(private.has_permission(p_tenant,'lessons.view',g.branch_id) or private.schedule_allowed(p_tenant,p_group)) then raise exception using errcode='42501',message='Scheduling options denied';end if;
 manage:=private.schedule_allowed(p_tenant,p_group,'schedules.manage') or private.group_allowed(p_tenant,p_group,'lessons.manage');
 return jsonb_build_object('group',private.lms_document(p_tenant,'group',p_group),'can_schedule',private.schedule_allowed(p_tenant,p_group,'schedules.manage'),'can_lesson',private.group_allowed(p_tenant,p_group,'lessons.manage') and private.has_permission(p_tenant,'lessons.view',g.branch_id),
 'teachers',case when manage then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name) order by lower(e.full_name),e.id) from public.employees e where e.tenant_id=p_tenant and private.employee_can_teach(p_tenant,e.id,g.branch_id) and exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.group_id=p_group and a.employee_id=e.id and a.ended_at is null)),'[]') else '[]'::jsonb end,
 'substitutes',case when manage then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name) order by lower(e.full_name),e.id) from public.employees e where e.tenant_id=p_tenant and private.employee_can_teach(p_tenant,e.id,g.branch_id)),'[]') else '[]'::jsonb end,
 'classrooms',case when manage then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'capacity',r.capacity,'is_active',r.is_active) order by lower(r.name),r.id) from public.classrooms r where r.tenant_id=p_tenant and r.branch_id=g.branch_id and private.classroom_allowed(p_tenant,r.id)),'[]') else '[]'::jsonb end);
end $$;
create function public.group_schedule_directory(p_tenant uuid,p_group uuid,p_page integer default 0,p_status text default 'current') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.schedule_allowed(p_tenant,p_group) then raise exception using errcode='42501',message='Weekly schedule access denied';end if;
 if p_page is null or p_page not between 0 and 100000 or p_status is null or p_status not in ('current','all') then raise exception 'Invalid schedule filters';end if;
 with rows as materialized(select s.id,s.series_id,s.weekday,s.start_time,s.end_time,s.timezone,s.effective_from,s.effective_to,s.teacher_id,s.classroom_id,s.is_active,s.version,e.full_name teacher_name,r.name classroom_name
 from public.group_schedule_slots s join public.employees e on e.tenant_id=p_tenant and e.id=s.teacher_id left join public.classrooms r on r.tenant_id=p_tenant and r.id=s.classroom_id
 where s.tenant_id=p_tenant and s.group_id=p_group and (p_status='all' or s.is_active and s.effective_to>=(now() at time zone s.timezone)::date)),
 page as(select * from rows order by effective_from desc,weekday,start_time,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by effective_from desc,weekday,start_time,id) from page),'[]')) into result;return result;
end $$;
create function public.group_schedule_details(p_tenant uuid,p_slot uuid,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.group_schedule_slots;manage boolean;
begin
 select * into s from public.group_schedule_slots where tenant_id=p_tenant and id=p_slot;
 if not found or not private.schedule_allowed(p_tenant,s.group_id) then raise exception using errcode='42501',message='Weekly schedule access denied';end if;
 manage:=private.schedule_allowed(p_tenant,s.group_id,'schedules.manage');
 return jsonb_build_object('slot',private.scheduling_document(p_tenant,'slot',p_slot),'can_manage',manage,'can_revise',manage and s.is_active and s.effective_to>=(now() at time zone s.timezone)::date and not exists(select 1 from public.group_schedule_slots where tenant_id=p_tenant and replaces_id=p_slot),
 'replacement_id',(select id from public.group_schedule_slots where tenant_id=p_tenant and replaces_id=p_slot),
 'future_lessons',(select count(*) from public.lessons where tenant_id=p_tenant and series_id=s.series_id and starts_at>=now() and status='scheduled'),
 'teacher_eligible',private.employee_can_teach(p_tenant,s.teacher_id,s.branch_id),'history',public.scheduling_history(p_tenant,'slot',p_slot,p_history_page));
end $$;
create function public.generation_batch_details(p_tenant uuid,p_batch uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.lesson_generation_batches;
begin
 select * into b from public.lesson_generation_batches where tenant_id=p_tenant and id=p_batch;
 if not found or not private.schedule_allowed(p_tenant,b.group_id,'schedules.manage') then raise exception using errcode='42501',message='Generation receipt denied';end if;
 return to_jsonb(b)-'created_by'-'tenant_id';
end $$;
create function public.lesson_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0,p_calendar boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;v_branch uuid;v_group uuid;v_course uuid;teacher uuid;room uuid;zone text;first_day date;last_day date;state text:=coalesce(p_filters->>'status','all');sorting text:=coalesce(p_filters->>'sort','start');size integer:=case when p_calendar then 200 else 20 end;
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'lessons.view',id) and (not p_calendar or private.has_permission(p_tenant,'schedules.view',id))) then raise exception using errcode='42501',message='Lesson directory denied';end if;
 select timezone into zone from public.tenants where id=p_tenant;
 first_day:=coalesce(private.lms_date(p_filters->>'from',true),(now() at time zone zone)::date);last_day:=coalesce(private.lms_date(p_filters->>'to',true),first_day+6);
 if p_page is null or p_page not between 0 and 100000 or p_calendar is null or last_day<first_day or last_day-first_day>(case when p_calendar then 41 else 365 end) or length(coalesce(p_filters->>'q',''))>100 or state not in ('all','scheduled','in_progress','completed','cancelled','rescheduled') or sorting not in ('start','newest') then raise exception 'Invalid lesson filters or date range';end if;
 v_branch:=nullif(p_filters->>'branch','')::uuid;v_group:=nullif(p_filters->>'group','')::uuid;v_course:=nullif(p_filters->>'course','')::uuid;room:=nullif(p_filters->>'classroom','')::uuid;
 if p_filters->>'teacher'='me' then select id into teacher from public.employees where tenant_id=p_tenant and user_id=auth.uid();if teacher is null then return jsonb_build_object('total',0,'rows','[]'::jsonb,'page_size',size);end if;else teacher:=nullif(p_filters->>'teacher','')::uuid;end if;
 with rows as materialized(select l.id,l.group_id,l.branch_id,l.starts_at,l.ends_at,l.timezone,l.teacher_id,l.substitute_id,l.effective_teacher_id,l.classroom_id,l.title,l.status,l.created_at,g.course_id,g.name group_name,c.name course_name,b.name branch_name,e.full_name teacher_name,sub.full_name substitute_name,r.name classroom_name
 from public.lessons l join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id join public.branches b on b.tenant_id=p_tenant and b.id=l.branch_id
 join public.employees e on e.tenant_id=p_tenant and e.id=l.teacher_id left join public.employees sub on sub.tenant_id=p_tenant and sub.id=l.substitute_id left join public.classrooms r on r.tenant_id=p_tenant and r.id=l.classroom_id
 where l.tenant_id=p_tenant and private.lesson_allowed(p_tenant,l.id) and (not p_calendar or private.has_permission(p_tenant,'schedules.view',l.branch_id))
 and l.starts_at<((last_day+1)::timestamp at time zone zone) and l.ends_at>(first_day::timestamp at time zone zone)
 and (v_branch is null or l.branch_id=v_branch) and (v_group is null or l.group_id=v_group) and (v_course is null or g.course_id=v_course) and (teacher is null or l.effective_teacher_id=teacher) and (room is null or l.classroom_id=room) and (state='all' or l.status=state)
 and position(lower(coalesce(p_filters->>'q','')) in lower(l.title||' '||g.name))>0),
 page as(select *,row_number() over(order by case when sorting='newest' then created_at end desc,starts_at,id) rank from rows order by rank limit size offset p_page*size)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)-'rank' order by rank) from page),'[]'),'page_size',size) into result;return result;
end $$;
create function public.lesson_details(p_tenant uuid,p_lesson uuid,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.lessons;manager boolean;can_complete boolean;
begin
 if not private.lesson_allowed(p_tenant,p_lesson) then raise exception using errcode='42501',message='Lesson access denied';end if;
 select * into l from public.lessons where tenant_id=p_tenant and id=p_lesson;manager:=private.lesson_allowed(p_tenant,p_lesson,'lessons.manage');
 can_complete:=manager or (private.lesson_allowed(p_tenant,p_lesson,'lessons.complete') and exists(select 1 from public.employees where tenant_id=p_tenant and id=l.effective_teacher_id and user_id=auth.uid() and private.employee_can_teach(p_tenant,id,l.branch_id)));
 return jsonb_build_object('lesson',private.scheduling_document(p_tenant,'lesson',p_lesson),'can_manage',manager,'can_edit',manager and l.status='scheduled' and l.starts_at>now(),
 'can_start',can_complete and l.status='scheduled' and l.starts_at<=now(),'can_complete',can_complete and l.status in ('scheduled','in_progress') and l.ends_at<=now(),
 'can_cancel',manager and l.status in ('scheduled','in_progress'),'can_roster',private.has_permission(p_tenant,'enrollments.view',l.branch_id),'can_open_group',private.group_allowed(p_tenant,l.group_id),
 'teacher_eligible',private.employee_can_teach(p_tenant,l.effective_teacher_id,l.branch_id),
 'replacement_id',(select id from public.lessons where tenant_id=p_tenant and rescheduled_from_id=p_lesson and private.lesson_allowed(p_tenant,id)),
 'history',public.scheduling_history(p_tenant,'lesson',p_lesson,p_history_page));
end $$;
create function public.lesson_expected_roster(p_tenant uuid,p_lesson uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.lessons;result jsonb;
begin
 select * into l from public.lessons where tenant_id=p_tenant and id=p_lesson;
 if not found or not private.lesson_allowed(p_tenant,p_lesson) or not private.has_permission(p_tenant,'enrollments.view',l.branch_id) then raise exception using errcode='42501',message='Expected lesson roster denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid roster page';end if;
 with live_ids as materialized(select distinct on(e.customer_id) e.id enrollment_id,e.customer_id from public.student_enrollments e where e.tenant_id=p_tenant and e.group_id=l.group_id and e.status in ('active','completed','withdrawn') and e.effective_start_date<=(l.starts_at at time zone l.timezone)::date and (e.effective_end_date is null or e.effective_end_date>=(l.starts_at at time zone l.timezone)::date) order by e.customer_id,case when e.status='active' then 0 else 1 end,e.effective_start_date desc,e.created_at desc,e.id),
 ids as materialized(select enrollment_id,customer_id from public.lesson_expected_students where tenant_id=p_tenant and lesson_id=p_lesson and l.roster_captured_at is not null union all select * from live_ids where l.roster_captured_at is null),
 rows as materialized(select ids.enrollment_id,ids.customer_id,trim(c.first_name||' '||c.last_name) name,s.student_identifier,private.customer_allowed(p_tenant,c.id,'customers.view') can_open_student from ids join public.customers c on c.tenant_id=p_tenant and c.id=ids.customer_id join public.student_profiles s on s.tenant_id=p_tenant and s.customer_id=ids.customer_id),
 page as(select * from rows order by lower(name),customer_id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by lower(name),customer_id) from page),'[]'),'captured_at',l.roster_captured_at) into result;return result;
end $$;
revoke all on function public.scheduling_history(uuid,text,uuid,integer),public.scheduling_options(uuid,uuid),public.group_schedule_directory(uuid,uuid,integer,text),public.group_schedule_details(uuid,uuid,integer),public.generation_batch_details(uuid,uuid),public.lesson_directory(uuid,jsonb,integer,boolean),public.lesson_details(uuid,uuid,integer),public.lesson_expected_roster(uuid,uuid,integer) from public,anon;
grant execute on function public.scheduling_history(uuid,text,uuid,integer),public.scheduling_options(uuid,uuid),public.group_schedule_directory(uuid,uuid,integer,text),public.group_schedule_details(uuid,uuid,integer),public.generation_batch_details(uuid,uuid),public.lesson_directory(uuid,jsonb,integer,boolean),public.lesson_details(uuid,uuid,integer),public.lesson_expected_roster(uuid,uuid,integer) to authenticated;
create function public.timetable_options(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'lessons.view',id)) then raise exception using errcode='42501',message='Timetable options denied';end if;
 with groups as materialized(select g.id,g.name,g.branch_id,g.course_id,c.name course_name,g.status,
 private.group_allowed(p_tenant,g.id,'lessons.manage') and private.has_permission(p_tenant,'lessons.view',g.branch_id) and g.status in ('planned','active') can_create
 from public.study_groups g join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id where g.tenant_id=p_tenant and (private.group_allowed(p_tenant,g.id) or exists(select 1 from public.lessons l where l.tenant_id=p_tenant and l.group_id=g.id and private.lesson_allowed(p_tenant,l.id)))),
 teachers as materialized(select e.id,e.full_name name from public.employees e where e.tenant_id=p_tenant and (exists(select 1 from public.lessons l where l.tenant_id=p_tenant and e.id=l.effective_teacher_id and private.lesson_allowed(p_tenant,l.id)) or exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.employee_id=e.id and a.ended_at is null and private.group_allowed(p_tenant,a.group_id))))
 select jsonb_build_object('groups',coalesce((select jsonb_agg(to_jsonb(g) order by lower(g.name),g.id) from groups g),'[]'),
 'teachers',coalesce((select jsonb_agg(to_jsonb(e) order by lower(e.name),e.id) from teachers e),'[]'),
 'classrooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'branch_id',r.branch_id) order by lower(r.name),r.id) from public.classrooms r where r.tenant_id=p_tenant and (private.classroom_allowed(p_tenant,r.id) or exists(select 1 from public.lessons l where l.tenant_id=p_tenant and l.classroom_id=r.id and private.lesson_allowed(p_tenant,l.id)))),'[]')) into result;return result;
end $$;
revoke all on function public.timetable_options(uuid) from public,anon;
grant execute on function public.timetable_options(uuid) to authenticated;
