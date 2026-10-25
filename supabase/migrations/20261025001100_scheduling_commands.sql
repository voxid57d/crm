create table public.lesson_generation_batches (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,from_date date not null,to_date date not null,
 created_count integer not null,existing_count integer not null,past_count integer not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(tenant_id,id),check(to_date>=from_date and to_date-from_date<=30),check(created_count>=0 and existing_count>=0 and past_count>=0),
 foreign key(tenant_id,group_id,branch_id) references public.study_groups(tenant_id,id,branch_id)
);
alter table public.lesson_generation_batches enable row level security;
revoke all on public.lesson_generation_batches from public,anon,authenticated;
create trigger generation_batches_immutable before update or delete on public.lesson_generation_batches for each row execute function private.academic_history_immutable();
create function private.scheduling_document(t uuid,kind text,identifier uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;
begin
 if kind='lesson' then
 select to_jsonb(l)||jsonb_build_object('group_name',g.name,'course_id',g.course_id,'course_name',c.name,'branch_name',b.name,'teacher_name',e.full_name,'substitute_name',sub.full_name,'classroom_name',r.name)
 into doc from public.lessons l join public.study_groups g on g.tenant_id=t and g.id=l.group_id join public.courses c on c.tenant_id=t and c.id=g.course_id join public.branches b on b.tenant_id=t and b.id=l.branch_id join public.employees e on e.tenant_id=t and e.id=l.teacher_id left join public.employees sub on sub.tenant_id=t and sub.id=l.substitute_id left join public.classrooms r on r.tenant_id=t and r.id=l.classroom_id where l.tenant_id=t and l.id=identifier;
 elsif kind='slot' then
 select to_jsonb(s)||jsonb_build_object('teacher_name',e.full_name,'classroom_name',r.name,'group_name',g.name,'branch_name',b.name)
 into doc from public.group_schedule_slots s join public.employees e on e.tenant_id=t and e.id=s.teacher_id join public.study_groups g on g.tenant_id=t and g.id=s.group_id join public.branches b on b.tenant_id=t and b.id=s.branch_id left join public.classrooms r on r.tenant_id=t and r.id=s.classroom_id where s.tenant_id=t and s.id=identifier;
 else raise exception 'Invalid scheduling resource';end if;return doc;
end $$;
create function private.scheduling_audit(t uuid,kind text,identifier uuid,operation text,before_value jsonb,reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare doc jsonb;
begin
 doc:=private.scheduling_document(t,kind,identifier);
 insert into public.scheduling_events(tenant_id,group_id,branch_id,slot_id,lesson_id,operation,actor_id,actor_name,reason,before_data,after_data)
 values(t,(doc->>'group_id')::uuid,(doc->>'branch_id')::uuid,case when kind='slot' then identifier end,case when kind='lesson' then identifier end,operation,auth.uid(),coalesce((select nullif(trim(full_name),'') from public.profiles where id=auth.uid()),'Business member'),reason,before_value,doc);
end $$;
create function public.save_group_schedule(p_tenant uuid,p_group uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare grp public.study_groups;old_slot public.group_schedule_slots;payload jsonb;replay uuid;result uuid;series uuid;first_day date;last_day date;zone text;before_value jsonb;
begin
 payload:=jsonb_build_object('command','schedule_save','group',p_group,'id',p_id,'version',p_version,'data',p_data,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into grp from public.study_groups where tenant_id=p_tenant and id=p_group;
 if not found or not private.schedule_allowed(p_tenant,p_group,'schedules.manage') then raise exception using errcode='42501',message='Weekly schedule management denied';end if;
 if p_id is not null then select * into old_slot from public.group_schedule_slots where tenant_id=p_tenant and id=p_id and group_id=p_group for update;if not found then raise exception using errcode='42501',message='Weekly schedule unavailable';end if;end if;
 if replay is not null then return replay;end if;
 if p_id is null and p_version is distinct from 0 or p_id is not null and p_version is distinct from old_slot.version then raise exception using errcode='40001',message='Weekly schedule changed; reload';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Valid schedule details and a reason are required';end if;
 first_day:=private.lms_date(p_data->>'effective_from');last_day:=private.lms_date(p_data->>'effective_to');zone:=p_data->>'timezone';
 if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) or first_day<(now() at time zone zone)::date then raise exception 'Choose a valid timezone and a current/future effective start';end if;
 if nullif(p_data->>'classroom_id','') is not null and not private.classroom_allowed(p_tenant,(p_data->>'classroom_id')::uuid) then raise exception using errcode='42501',message='Schedule classroom access denied';end if;
 if p_id is null then
 insert into public.group_schedule_series(tenant_id,group_id,branch_id,created_by) values(p_tenant,p_group,grp.branch_id,auth.uid()) returning id into series;
 else
 if not old_slot.is_active or old_slot.effective_to<(now() at time zone old_slot.timezone)::date or exists(select 1 from public.group_schedule_slots where tenant_id=p_tenant and replaces_id=p_id) then raise exception 'Only the latest current/future revision can be changed';end if;
 if first_day<(now() at time zone old_slot.timezone)::date then raise exception 'Past schedule periods cannot be rewritten';end if;
 before_value:=private.scheduling_document(p_tenant,'slot',p_id);series:=old_slot.series_id;
 update public.group_schedule_slots set effective_to=case when first_day>effective_from then least(effective_to,first_day-1) else effective_to end,is_active=first_day>effective_from,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id;
 perform private.scheduling_audit(p_tenant,'slot',p_id,'schedule_period_closed',before_value,trim(p_reason));end if;
 insert into public.group_schedule_slots(tenant_id,series_id,group_id,branch_id,weekday,start_time,end_time,timezone,effective_from,effective_to,teacher_id,classroom_id,replaces_id,created_by)
 values(p_tenant,series,p_group,grp.branch_id,private.academic_integer(p_data->>'weekday',1,7),private.schedule_clock(p_data->>'start_time'),private.schedule_clock(p_data->>'end_time'),zone,first_day,last_day,(p_data->>'teacher_id')::uuid,nullif(p_data->>'classroom_id','')::uuid,p_id,auth.uid()) returning id into result;
 perform private.scheduling_audit(p_tenant,'slot',result,case when p_id is null then 'schedule_created' else 'schedule_revision_created' end,null,trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,result);return result;
end $$;
create function public.end_group_schedule(p_tenant uuid,p_slot uuid,p_request uuid,p_version integer,p_from text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.group_schedule_slots;payload jsonb;replay uuid;cutoff date;before_value jsonb;
begin
 payload:=jsonb_build_object('command','schedule_end','id',p_slot,'version',p_version,'from',p_from,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into s from public.group_schedule_slots where tenant_id=p_tenant and id=p_slot for update;
 if not found or not private.schedule_allowed(p_tenant,s.group_id,'schedules.manage') then raise exception using errcode='42501',message='Weekly schedule ending denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from s.version then raise exception using errcode='40001',message='Weekly schedule changed; reload';end if;
 cutoff:=private.lms_date(p_from);
 if not s.is_active or cutoff<(now() at time zone s.timezone)::date or cutoff>s.effective_to+1 or exists(select 1 from public.group_schedule_slots where tenant_id=p_tenant and replaces_id=p_slot) or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Choose a current/future stop date, latest enabled revision and reason';end if;
 before_value:=private.scheduling_document(p_tenant,'slot',p_slot);
 update public.group_schedule_slots set effective_to=case when cutoff>effective_from then least(effective_to,cutoff-1) else effective_to end,is_active=cutoff>effective_from,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_slot;
 perform private.scheduling_audit(p_tenant,'slot',p_slot,'schedule_ended',before_value,trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,p_slot);return p_slot;
end $$;
create function private.new_lesson(t uuid,g uuid,data jsonb,series uuid default null,slot uuid default null,day date default null,source_version integer default null,source uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;b uuid;zone text;room uuid;
begin
 if jsonb_typeof(data) is distinct from 'object' or length(trim(coalesce(data->>'title',''))) not between 1 and 200 or length(coalesce(data->>'notes',''))>5000 then raise exception 'Invalid lesson title or notes';end if;
 select branch_id into b from public.study_groups where tenant_id=t and id=g;zone:=data->>'timezone';room:=nullif(data->>'classroom_id','')::uuid;
 if room is not null and not private.classroom_allowed(t,room) then raise exception using errcode='42501',message='Lesson classroom access denied';end if;
 insert into public.lessons(tenant_id,group_id,branch_id,starts_at,ends_at,timezone,teacher_id,substitute_id,classroom_id,title,notes,series_id,schedule_slot_id,occurrence_date,schedule_version,rescheduled_from_id,created_by)
 values(t,g,b,private.academic_instant(data->>'local_start',zone),private.academic_instant(data->>'local_end',zone),zone,(data->>'teacher_id')::uuid,nullif(data->>'substitute_id','')::uuid,room,trim(data->>'title'),trim(coalesce(data->>'notes','')),series,slot,day,source_version,source,auth.uid()) returning id into result;
 perform private.scheduling_audit(t,'lesson',result,case when source is not null then 'lesson_rescheduled_in' when series is not null then 'lesson_generated' else 'lesson_created' end,null,trim(coalesce(data->>'reason','')));return result;
end $$;
create function public.save_lesson(p_tenant uuid,p_group uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;payload jsonb;replay uuid;result uuid;before_value jsonb;room uuid;zone text;
begin
 payload:=jsonb_build_object('command','lesson_save','group',p_group,'id',p_id,'version',p_version,'data',p_data,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 if p_id is null then
 if not private.group_allowed(p_tenant,p_group,'lessons.manage') or not exists(select 1 from public.study_groups where tenant_id=p_tenant and id=p_group and private.has_permission(p_tenant,'lessons.view',branch_id)) then raise exception using errcode='42501',message='Lesson creation denied';end if;
 else
 select * into l from public.lessons where tenant_id=p_tenant and id=p_id for update;
 if not found or l.group_id<>p_group or not private.lesson_allowed(p_tenant,p_id,'lessons.manage') then raise exception using errcode='42501',message='Lesson update denied';end if;end if;
 if replay is not null then return replay;end if;
 if p_id is null and p_version is distinct from 0 or p_id is not null and p_version is distinct from l.version then raise exception using errcode='40001',message='Lesson changed; reload';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Valid lesson details and reason are required';end if;
 if p_id is null then result:=private.new_lesson(p_tenant,p_group,p_data||jsonb_build_object('reason',trim(p_reason)));
 else
 if length(trim(coalesce(p_data->>'title',''))) not between 1 and 200 or length(coalesce(p_data->>'notes',''))>5000 then raise exception 'Invalid lesson title or notes';end if;
 room:=nullif(p_data->>'classroom_id','')::uuid;zone:=p_data->>'timezone';
 if room is not null and not private.classroom_allowed(p_tenant,room) then raise exception using errcode='42501',message='Lesson classroom access denied';end if;
 if private.academic_instant(p_data->>'local_start',zone)<>l.starts_at or private.academic_instant(p_data->>'local_end',zone)<>l.ends_at then raise exception 'Use rescheduling to move lesson times';end if;
 before_value:=private.scheduling_document(p_tenant,'lesson',p_id);
 update public.lessons set teacher_id=(p_data->>'teacher_id')::uuid,substitute_id=nullif(p_data->>'substitute_id','')::uuid,classroom_id=room,timezone=zone,title=trim(p_data->>'title'),notes=trim(coalesce(p_data->>'notes','')),version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id returning id into result;
 perform private.scheduling_audit(p_tenant,'lesson',p_id,'lesson_updated',before_value,trim(p_reason));end if;
 perform private.lms_finish(p_tenant,p_request,payload,result);return result;
end $$;
create function public.transition_lesson(p_tenant uuid,p_lesson uuid,p_request uuid,p_version integer,p_status text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;payload jsonb;replay uuid;before_value jsonb;manager boolean;
begin
 payload:=jsonb_build_object('command','lesson_status','id',p_lesson,'version',p_version,'status',p_status,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into l from public.lessons where tenant_id=p_tenant and id=p_lesson for update;manager:=private.lesson_allowed(p_tenant,p_lesson,'lessons.manage');
 if not found or not private.lesson_allowed(p_tenant,p_lesson) or (p_status='cancelled' and not manager) or (p_status in ('in_progress','completed') and not manager and (not private.lesson_allowed(p_tenant,p_lesson,'lessons.complete') or not exists(select 1 from public.employees where tenant_id=p_tenant and id=l.effective_teacher_id and user_id=auth.uid() and private.employee_can_teach(p_tenant,id,l.branch_id)))) then raise exception using errcode='42501',message='Lesson lifecycle denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from l.version then raise exception using errcode='40001',message='Lesson changed; reload';end if;
 if p_status is null or p_status not in ('in_progress','completed','cancelled') or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Choose a supported lesson status and reason';end if;
 if p_status='in_progress' and not exists(select 1 from public.study_groups g join public.branches b on b.tenant_id=g.tenant_id and b.id=g.branch_id where g.tenant_id=p_tenant and g.id=l.group_id and g.status='active' and b.is_active) then raise exception 'Activate the group and branch before starting a lesson';end if;
 before_value:=private.scheduling_document(p_tenant,'lesson',p_lesson);
 update public.lessons set status=p_status,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_lesson;
 perform private.scheduling_audit(p_tenant,'lesson',p_lesson,'lesson_'||p_status,before_value,trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,p_lesson);return p_lesson;
end $$;
create function public.reschedule_lesson(p_tenant uuid,p_lesson uuid,p_request uuid,p_version integer,p_data jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;payload jsonb;replay uuid;result uuid;before_value jsonb;
begin
 payload:=jsonb_build_object('command','lesson_reschedule','id',p_lesson,'version',p_version,'data',p_data,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into l from public.lessons where tenant_id=p_tenant and id=p_lesson for update;
 if not found or not private.lesson_allowed(p_tenant,p_lesson,'lessons.manage') then raise exception using errcode='42501',message='Lesson rescheduling denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from l.version then raise exception using errcode='40001',message='Lesson changed; reload';end if;
 if l.status<>'scheduled' or l.starts_at<=now() or p_reason is null or length(trim(p_reason)) not between 3 and 1000 or private.academic_instant(p_data->>'local_start',p_data->>'timezone')<=now() then raise exception 'Reschedule an upcoming scheduled lesson to a future time with a reason';end if;
 before_value:=private.scheduling_document(p_tenant,'lesson',p_lesson);
 update public.lessons set status='rescheduled',version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_lesson;
 result:=private.new_lesson(p_tenant,l.group_id,p_data||jsonb_build_object('reason',trim(p_reason)),l.series_id,l.schedule_slot_id,l.occurrence_date,l.schedule_version,l.id);
 perform private.scheduling_audit(p_tenant,'lesson',p_lesson,'lesson_rescheduled_out',before_value,trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,result);return result;
end $$;
create function public.generate_group_lessons(p_tenant uuid,p_group uuid,p_request uuid,p_from text,p_to text) returns jsonb language plpgsql security definer set search_path='' as $$
declare grp public.study_groups;s record;payload jsonb;replay uuid;first_day date;last_day date;starts timestamptz;created integer:=0;existing integer:=0;past integer:=0;batch uuid;result jsonb;
begin
 payload:=jsonb_build_object('command','generate_lessons','group',p_group,'from',p_from,'to',p_to);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into grp from public.study_groups where tenant_id=p_tenant and id=p_group;
 if not found or not private.schedule_allowed(p_tenant,p_group,'schedules.manage') or not private.group_allowed(p_tenant,p_group,'lessons.manage') then raise exception using errcode='42501',message='Lesson generation denied';end if;
 if replay is not null then select to_jsonb(b)-'created_by'-'tenant_id' into result from public.lesson_generation_batches b where tenant_id=p_tenant and id=replay;return result;end if;
 first_day:=private.lms_date(p_from);last_day:=private.lms_date(p_to);
 if last_day<first_day or last_day-first_day>30 or first_day<(now() at time zone (select timezone from public.tenants where id=p_tenant))::date then raise exception 'Generate a current/future range of at most 31 days';end if;
 for s in select slot.*,day::date occurrence from public.group_schedule_slots slot cross join lateral generate_series(greatest(slot.effective_from,first_day)::timestamp,least(slot.effective_to,last_day)::timestamp,interval '1 day') day
 where slot.tenant_id=p_tenant and slot.group_id=p_group and slot.is_active and extract(isodow from day)=slot.weekday order by day,slot.start_time,slot.id loop
 if exists(select 1 from public.lessons where tenant_id=p_tenant and series_id=s.series_id and occurrence_date=s.occurrence and rescheduled_from_id is null) then existing:=existing+1;continue;end if;
 starts:=private.academic_instant(s.occurrence::text||'T'||to_char(s.start_time,'HH24:MI'),s.timezone);if starts<now() then past:=past+1;continue;end if;
 perform private.new_lesson(p_tenant,p_group,jsonb_build_object('local_start',s.occurrence::text||'T'||to_char(s.start_time,'HH24:MI'),'local_end',s.occurrence::text||'T'||to_char(s.end_time,'HH24:MI'),'timezone',s.timezone,'teacher_id',s.teacher_id,'classroom_id',coalesce(s.classroom_id::text,''),'title',left('Lesson: '||grp.name,200),'reason','Generated from weekly schedule'),s.series_id,s.id,s.occurrence,s.version);created:=created+1;end loop;
 insert into public.lesson_generation_batches(tenant_id,group_id,branch_id,from_date,to_date,created_count,existing_count,past_count,created_by) values(p_tenant,p_group,grp.branch_id,first_day,last_day,created,existing,past,auth.uid()) returning id into batch;
 perform private.lms_finish(p_tenant,p_request,payload,batch);select to_jsonb(b)-'created_by'-'tenant_id' into result from public.lesson_generation_batches b where id=batch;return result;
end $$;
revoke all on function private.scheduling_document(uuid,text,uuid),private.scheduling_audit(uuid,text,uuid,text,jsonb,text),private.new_lesson(uuid,uuid,jsonb,uuid,uuid,date,integer,uuid) from public,anon,authenticated;
revoke all on function public.save_group_schedule(uuid,uuid,uuid,uuid,integer,jsonb,text),public.end_group_schedule(uuid,uuid,uuid,integer,text,text),public.save_lesson(uuid,uuid,uuid,uuid,integer,jsonb,text),public.transition_lesson(uuid,uuid,uuid,integer,text,text),public.reschedule_lesson(uuid,uuid,uuid,integer,jsonb,text),public.generate_group_lessons(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.save_group_schedule(uuid,uuid,uuid,uuid,integer,jsonb,text),public.end_group_schedule(uuid,uuid,uuid,integer,text,text),public.save_lesson(uuid,uuid,uuid,uuid,integer,jsonb,text),public.transition_lesson(uuid,uuid,uuid,integer,text,text),public.reschedule_lesson(uuid,uuid,uuid,integer,jsonb,text),public.generate_group_lessons(uuid,uuid,uuid,text,text) to authenticated;
