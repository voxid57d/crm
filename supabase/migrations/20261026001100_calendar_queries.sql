create function public.academic_closure_directory(p_tenant uuid,p_filters jsonb,p_page integer default 0,p_calendar boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_branch uuid;zone text;first_day date;last_day date;state text:=coalesce(p_filters->>'status','active');size integer:=case when p_calendar then 200 else 20 end;result jsonb;
begin
 if not private.closure_allowed(p_tenant,null) then raise exception using errcode='42501',message='Non-teaching dates denied';end if;
 select timezone into zone from public.tenants where id=p_tenant;
 first_day:=private.lms_date(p_filters->>'from');last_day:=private.lms_date(p_filters->>'to');v_branch:=nullif(p_filters->>'branch','')::uuid;
 if p_page is null or p_page not between 0 and 100000 or p_calendar is null or last_day<first_day or last_day-first_day>(case when p_calendar then 41 else 365 end) or state not in ('active','inactive','all') or length(coalesce(p_filters->>'q',''))>100 then raise exception 'Invalid closure filters';end if;
 with rows as materialized(select c.*,b.name branch_name,(c.from_date::timestamp at time zone c.timezone) starts_at,((c.to_date+1)::timestamp at time zone c.timezone) ends_at,
  private.closure_allowed(p_tenant,c.branch_id,'schedules.manage_holidays') can_manage
  from public.academic_closures c left join public.branches b on b.tenant_id=p_tenant and b.id=c.branch_id where c.tenant_id=p_tenant and private.closure_allowed(p_tenant,c.branch_id)
  and (v_branch is null or c.branch_id is null or c.branch_id=v_branch) and (state='all' or c.is_active=(state='active'))
  and (c.from_date::timestamp at time zone c.timezone)<((last_day+1)::timestamp at time zone zone) and (first_day::timestamp at time zone zone)<((c.to_date+1)::timestamp at time zone c.timezone)
  and position(lower(coalesce(p_filters->>'q','')) in lower(c.name||' '||c.reason))>0),
 page as(select * from rows order by from_date,id limit size offset p_page*size)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by from_date,id) from page),'[]'),'page_size',size) into result;return result;
end $$;

create function public.academic_calendar_history(p_tenant uuid,p_closure uuid,p_exception uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if num_nonnulls(p_closure,p_exception)<>1 or p_closure is not null and not exists(select 1 from public.academic_closures where tenant_id=p_tenant and id=p_closure and private.closure_allowed(p_tenant,branch_id))
  or p_exception is not null and not exists(select 1 from public.group_schedule_exceptions where tenant_id=p_tenant and id=p_exception and private.schedule_allowed(p_tenant,group_id)) then raise exception using errcode='42501',message='Academic calendar history denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid calendar history page';end if;
 with rows as materialized(select id,operation,actor_name,reason,before_data,after_data,created_at from public.academic_calendar_events where tenant_id=p_tenant and (closure_id=p_closure or exception_id=p_exception)),
 page as(select * from rows order by created_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
create function public.academic_closure_details(p_tenant uuid,p_closure uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.academic_closures;
begin
 select * into c from public.academic_closures where tenant_id=p_tenant and id=p_closure;
 if not found or not private.closure_allowed(p_tenant,c.branch_id) then raise exception using errcode='42501',message='Closure access denied';end if;
 return jsonb_build_object('closure',to_jsonb(c)||jsonb_build_object('branch_name',(select name from public.branches where tenant_id=p_tenant and id=c.branch_id)),
 'can_manage',private.closure_allowed(p_tenant,c.branch_id,'schedules.manage_holidays'),'history',public.academic_calendar_history(p_tenant,c.id,null,p_page));
end $$;
create function public.closure_lesson_impact(p_tenant uuid,p_closure uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.academic_closures;result jsonb;
begin
 select * into c from public.academic_closures where tenant_id=p_tenant and id=p_closure;
 if not found or not private.closure_allowed(p_tenant,c.branch_id) then raise exception using errcode='42501',message='Closure impact denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid closure impact page';end if;
 with rows as materialized(select l.id,l.group_id,l.status,l.starts_at,l.ends_at,l.timezone,g.name group_name,b.name branch_name,
  exists(select 1 from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=l.id and state='finalized') has_finalized_attendance,
  private.lesson_allowed(p_tenant,l.id,'lessons.manage') and l.status='scheduled' and l.starts_at>now() can_reschedule
  from public.lessons l join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id join public.branches b on b.tenant_id=p_tenant and b.id=l.branch_id where l.tenant_id=p_tenant and private.lesson_allowed(p_tenant,l.id)
  and (c.branch_id is null or l.branch_id=c.branch_id) and l.starts_at<((c.to_date+1)::timestamp at time zone c.timezone) and (c.from_date::timestamp at time zone c.timezone)<l.ends_at
  and l.status in ('scheduled','in_progress','completed')),
 page as(select * from rows order by starts_at,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by starts_at,id) from page),'[]')) into result;return result;
end $$;

create function public.schedule_exception_directory(p_tenant uuid,p_group uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.schedule_allowed(p_tenant,p_group) then raise exception using errcode='42501',message='Weekly exceptions denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid exception page';end if;
 with rows as materialized(select e.*,(select id from public.lessons where tenant_id=p_tenant and series_id=e.series_id and occurrence_date=e.occurrence_date and rescheduled_from_id is null and private.lesson_allowed(p_tenant,id)) lesson_id
 from public.group_schedule_exceptions e where e.tenant_id=p_tenant and e.group_id=p_group),
 page as(select * from rows order by occurrence_date desc,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by occurrence_date desc,id) from page),'[]')) into result;return result;
end $$;
create function public.generation_skip_directory(p_tenant uuid,p_batch uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.lesson_generation_batches;result jsonb;
begin
 select * into b from public.lesson_generation_batches where tenant_id=p_tenant and id=p_batch;
 if not found or not private.schedule_allowed(p_tenant,b.group_id,'schedules.manage') then raise exception using errcode='42501',message='Generation skips denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid skip page';end if;
 with rows as materialized(select id,occurrence_date,reason,closure_id,exception_id,slot_id,series_id from public.lesson_generation_skips where tenant_id=p_tenant and batch_id=p_batch),
 page as(select * from rows order by occurrence_date,id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by occurrence_date,id) from page),'[]')) into result;return result;
end $$;

create function public.lesson_calendar_context(p_tenant uuid,p_lesson uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.lessons;
begin
 if not private.lesson_allowed(p_tenant,p_lesson) then raise exception using errcode='42501',message='Lesson calendar context denied';end if;
 select * into l from public.lessons where tenant_id=p_tenant and id=p_lesson;
 return jsonb_build_object('blocked',private.closure_hits(p_tenant,l.branch_id,l.starts_at,l.ends_at),
 'has_finalized_attendance',exists(select 1 from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=l.id and state='finalized'),
 'closures',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'from_date',from_date,'to_date',to_date,'timezone',timezone)) from public.academic_closures where tenant_id=p_tenant and is_active and (branch_id is null or branch_id=l.branch_id)
 and private.closure_allowed(p_tenant,branch_id) and l.starts_at<((to_date+1)::timestamp at time zone timezone) and (from_date::timestamp at time zone timezone)<l.ends_at),'[]'),
 'cancellation',(select jsonb_build_object('at',created_at,'by',actor_name,'reason',reason,'previous_status',before_data->>'status') from public.scheduling_events where tenant_id=p_tenant and lesson_id=p_lesson and operation='lesson_cancelled' order by created_at desc,id desc limit 1),
 'latest_change',(select jsonb_build_object('at',created_at,'by',actor_name,'reason',reason,'operation',operation) from public.scheduling_events where tenant_id=p_tenant and lesson_id=p_lesson and operation in ('lesson_rescheduled_out','lesson_rescheduled_in','lesson_updated') order by created_at desc,id desc limit 1));
end $$;
create function public.lesson_change_directory(p_tenant uuid,p_filters jsonb,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;zone text;v_branch uuid;result jsonb;
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'lessons.view',id)) then raise exception using errcode='42501',message='Schedule change feed denied';end if;
 select timezone into zone from public.tenants where id=p_tenant;first_day:=private.lms_date(p_filters->>'from');last_day:=private.lms_date(p_filters->>'to');v_branch:=nullif(p_filters->>'branch','')::uuid;
 if p_page is null or p_page not between 0 and 100000 or last_day<first_day or last_day-first_day>365 then raise exception 'Invalid schedule change filters';end if;
 with rows as materialized(select a.id,a.lesson_id,a.operation,a.reason,a.actor_name,a.created_at,l.starts_at,l.ends_at,l.status,g.name group_name,b.name branch_name
 from public.scheduling_events a join public.lessons l on l.tenant_id=p_tenant and l.id=a.lesson_id join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id join public.branches b on b.tenant_id=p_tenant and b.id=l.branch_id
 where a.tenant_id=p_tenant and private.lesson_allowed(p_tenant,l.id) and (v_branch is null or l.branch_id=v_branch)
 and a.operation in ('lesson_rescheduled_out','lesson_rescheduled_in','lesson_cancelled','lesson_updated')
 and a.created_at>=(first_day::timestamp at time zone zone) and a.created_at<((last_day+1)::timestamp at time zone zone)),
 page as(select * from rows order by created_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
revoke all on function public.academic_closure_directory(uuid,jsonb,integer,boolean),public.academic_calendar_history(uuid,uuid,uuid,integer),public.academic_closure_details(uuid,uuid,integer),public.closure_lesson_impact(uuid,uuid,integer),public.schedule_exception_directory(uuid,uuid,integer),public.generation_skip_directory(uuid,uuid,integer),public.lesson_calendar_context(uuid,uuid),public.lesson_change_directory(uuid,jsonb,integer) from public,anon;
grant execute on function public.academic_closure_directory(uuid,jsonb,integer,boolean),public.academic_calendar_history(uuid,uuid,uuid,integer),public.academic_closure_details(uuid,uuid,integer),public.closure_lesson_impact(uuid,uuid,integer),public.schedule_exception_directory(uuid,uuid,integer),public.generation_skip_directory(uuid,uuid,integer),public.lesson_calendar_context(uuid,uuid),public.lesson_change_directory(uuid,jsonb,integer) to authenticated;
