-- Explicit JSON receipt initialization and retained calendar-date contracts.
create or replace function public.generate_group_lessons(p_tenant uuid,p_group uuid,p_request uuid,p_from text,p_to text) returns jsonb language plpgsql security definer set search_path='' as $$
declare grp public.study_groups;s record;payload jsonb;replay uuid;first_day date;last_day date;starts timestamptz;ends timestamptz;
 created integer:=0;existing integer:=0;past integer:=0;closed integer:=0;excepted integer:=0;batch uuid;result jsonb;v_closure uuid;v_exception uuid;skips jsonb:='[]'::jsonb;
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


create or replace function private.closure_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Non-teaching date history is retained';end if;
 perform 1 from public.tenants where id=new.tenant_id for update;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Choose a valid closure timezone';end if;
 if tg_op='UPDATE' then
  if old.from_date>=(now() at time zone old.timezone)::date and new.from_date<(now() at time zone old.timezone)::date then raise exception 'Create a current or future non-teaching date';end if;
  if (new.id,new.tenant_id,new.branch_id,new.timezone,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.branch_id,old.timezone,old.created_by,old.created_at) or new.version<>old.version+1 then raise exception 'Closure scope/timezone is immutable and version must advance once';end if;
  if old.from_date<(now() at time zone old.timezone)::date and (new.name,new.reason,new.from_date,new.to_date) is distinct from (old.name,old.reason,old.from_date,old.to_date) then raise exception 'Past closure definitions are retained; only their enabled state can change';end if;
 else
  if new.from_date<(now() at time zone new.timezone)::date then raise exception 'Create a current or future non-teaching date';end if;
 end if;
 return new;
end $$;
