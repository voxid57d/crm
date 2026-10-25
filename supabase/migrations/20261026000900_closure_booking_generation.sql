-- Existing concrete bookings continue reserving resources until explicitly resolved.
-- Unmaterialized closed/skipped occurrences do not reserve teaching resources.
create or replace function private.schedule_occurrences(t uuid,range_start timestamptz,range_end timestamptz,g uuid,teacher uuid,room uuid)
returns table(slot_id uuid,series_id uuid,group_id uuid,teacher_id uuid,classroom_id uuid,day date,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 with occurrences as(select s.id slot_id,s.series_id,s.group_id,s.branch_id,s.teacher_id,s.classroom_id,d::date as "day",
 private.academic_instant(to_char(d,'YYYY-MM-DD')||'T'||to_char(s.start_time,'HH24:MI'),s.timezone) starts_at,
 private.academic_instant(to_char(d,'YYYY-MM-DD')||'T'||to_char(s.end_time,'HH24:MI'),s.timezone) ends_at
 from public.group_schedule_slots s cross join lateral generate_series(greatest(s.effective_from,(range_start at time zone s.timezone)::date-1)::timestamp,least(s.effective_to,(range_end at time zone s.timezone)::date+1)::timestamp,interval '1 day') d
 where s.tenant_id=t and s.is_active and (s.group_id=g or s.teacher_id=teacher or (room is not null and s.classroom_id=room)) and extract(isodow from d)=s.weekday
 and not exists(select 1 from public.lessons l where l.tenant_id=t and l.series_id=s.series_id and l.occurrence_date=d::date and l.rescheduled_from_id is null)
 and not exists(select 1 from public.group_schedule_exceptions e where e.tenant_id=t and e.series_id=s.series_id and e.occurrence_date=d::date and e.is_active))
 select o.slot_id,o.series_id,o.group_id,o.teacher_id,o.classroom_id,o.day,o.starts_at,o.ends_at from occurrences o where not private.closure_hits(t,o.branch_id,o.starts_at,o.ends_at);
$$;

create or replace function public.generate_group_lessons(p_tenant uuid,p_group uuid,p_request uuid,p_from text,p_to text) returns jsonb language plpgsql security definer set search_path='' as $$
declare grp public.study_groups;s record;payload jsonb;replay uuid;first_day date;last_day date;starts timestamptz;ends timestamptz;
 created integer:=0;existing integer:=0;past integer:=0;closed integer:=0;excepted integer:=0;batch uuid;result jsonb;v_closure uuid;v_exception uuid;skips jsonb:='[]';
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
  starts:=private.academic_instant(s.occurrence::text||'T'||to_char(s.start_time,'HH24:MI'),s.timezone);ends:=private.academic_instant(s.occurrence::text||'T'||to_char(s.end_time,'HH24:MI'),s.timezone);
  if starts<now() then past:=past+1;continue;end if;
  select id into v_exception from public.group_schedule_exceptions where tenant_id=p_tenant and series_id=s.series_id and occurrence_date=s.occurrence and is_active;
  select id into v_closure from public.academic_closures where tenant_id=p_tenant and is_active and (branch_id is null or branch_id=grp.branch_id)
   and starts<((to_date+1)::timestamp at time zone timezone) and (from_date::timestamp at time zone timezone)<ends order by from_date,id limit 1;
  if v_exception is not null or v_closure is not null then
   if v_exception is not null then excepted:=excepted+1;else closed:=closed+1;end if;
   skips:=skips||jsonb_build_array(jsonb_build_object('slot_id',s.id,'series_id',s.series_id,'day',s.occurrence,'reason',case when v_exception is not null then 'exception' else 'closure' end,
     'closure_id',case when v_exception is null then v_closure end,'exception_id',v_exception));continue;
  end if;
  perform private.new_lesson(p_tenant,p_group,jsonb_build_object('local_start',s.occurrence::text||'T'||to_char(s.start_time,'HH24:MI'),'local_end',s.occurrence::text||'T'||to_char(s.end_time,'HH24:MI'),'timezone',s.timezone,'teacher_id',s.teacher_id,'classroom_id',coalesce(s.classroom_id::text,''),'title',left('Lesson: '||grp.name,200),'reason','Generated from weekly schedule'),s.series_id,s.id,s.occurrence,s.version);created:=created+1;
 end loop;
 insert into public.lesson_generation_batches(tenant_id,group_id,branch_id,from_date,to_date,created_count,existing_count,past_count,closure_count,exception_count,created_by)
 values(p_tenant,p_group,grp.branch_id,first_day,last_day,created,existing,past,closed,excepted,auth.uid()) returning id into batch;
 insert into public.lesson_generation_skips(tenant_id,batch_id,slot_id,series_id,group_id,branch_id,occurrence_date,reason,closure_id,exception_id)
 select p_tenant,batch,x.slot_id,x.series_id,p_group,grp.branch_id,x.day,x.reason,x.closure_id,x.exception_id from jsonb_to_recordset(skips) x(slot_id uuid,series_id uuid,"day" date,reason text,closure_id uuid,exception_id uuid);
 perform private.lms_finish(p_tenant,p_request,payload,batch);select to_jsonb(b)-'created_by'-'tenant_id' into result from public.lesson_generation_batches b where id=batch;return result;
end $$;

create or replace function private.schedule_slot_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d date;starts timestamptz;ends timestamptz;grp public.study_groups;parent public.group_schedule_slots;
begin
 if tg_op='DELETE' then raise exception 'Weekly schedule history is retained';end if;
 perform 1 from public.tenants where id=new.tenant_id for update;
 if tg_op='UPDATE' then
 if (to_jsonb(new)-'effective_to'-'is_active'-'version'-'updated_at') is distinct from (to_jsonb(old)-'effective_to'-'is_active'-'version'-'updated_at') or not old.is_active or new.version<>old.version+1 or new.effective_to>old.effective_to then raise exception 'Schedule definitions are retained; create an effective revision';end if;return new;
 end if;
 select * into grp from public.study_groups where tenant_id=new.tenant_id and id=new.group_id;
 if not found or grp.status not in ('planned','active') or not exists(select 1 from public.branches where tenant_id=new.tenant_id and id=grp.branch_id and is_active) or not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Choose an active branch, planned/active group and valid timezone';end if;
 if new.classroom_id is not null and not exists(select 1 from public.classrooms where tenant_id=new.tenant_id and id=new.classroom_id and branch_id=grp.branch_id and is_active and capacity>=grp.capacity) then raise exception 'Choose an active same-branch classroom covering group capacity';end if;
 if new.branch_id is distinct from grp.branch_id or new.effective_from<grp.start_date or (grp.end_date is not null and new.effective_to>grp.end_date) or new.effective_to<new.effective_from or new.effective_to-new.effective_from>365 then raise exception 'Schedule dates must fit the group and a maximum one-year period';end if;
 if exists(select 1 from public.group_schedule_slots where tenant_id=new.tenant_id and series_id=new.series_id and is_active and effective_from<=new.effective_to and new.effective_from<=effective_to) then raise exception 'Schedule revisions cannot have overlapping effective periods';end if;
 if new.replaces_id is not null then
 select * into parent from public.group_schedule_slots where tenant_id=new.tenant_id and id=new.replaces_id;
 if parent.series_id is distinct from new.series_id or parent.group_id is distinct from new.group_id then raise exception 'Replacement must use the same schedule series/group';end if;end if;
 for d in select day::date from generate_series(new.effective_from::timestamp,new.effective_to::timestamp,interval '1 day') day where extract(isodow from day)=new.weekday loop
 starts:=private.academic_instant(d::text||'T'||to_char(new.start_time,'HH24:MI'),new.timezone);ends:=private.academic_instant(d::text||'T'||to_char(new.end_time,'HH24:MI'),new.timezone);
 perform private.teaching_resources(new.tenant_id,new.group_id,new.teacher_id,null,new.classroom_id,new.timezone,starts,ends);
 if not private.closure_hits(new.tenant_id,new.branch_id,starts,ends) and not exists(select 1 from public.group_schedule_exceptions where tenant_id=new.tenant_id and series_id=new.series_id and occurrence_date=d and is_active) and not exists(select 1 from public.lessons where tenant_id=new.tenant_id and series_id=new.series_id and occurrence_date=d and rescheduled_from_id is null) then
 perform private.assert_booking(new.tenant_id,new.group_id,new.teacher_id,new.classroom_id,starts,ends,null,new.series_id,d);end if;end loop;
 -- Validate resources even for short periods containing no matching weekday.
 if not private.employee_can_teach(new.tenant_id,new.teacher_id,grp.branch_id) or not exists(select 1 from public.group_teacher_assignments where tenant_id=new.tenant_id and group_id=new.group_id and employee_id=new.teacher_id and ended_at is null) then raise exception 'Primary teacher needs an active eligible assignment to this group';end if;
 return new;
end $$;
