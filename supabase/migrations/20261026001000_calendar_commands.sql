create function private.calendar_audit(t uuid,c uuid,e uuid,operation text,before_value jsonb,after_value jsonb,reason text) returns void language sql security definer set search_path='' as $$
 insert into public.academic_calendar_events(tenant_id,closure_id,exception_id,operation,actor_id,actor_name,reason,before_data,after_data)
 values(t,c,e,operation,auth.uid(),coalesce((select nullif(trim(full_name),'') from public.profiles where id=auth.uid()),'Business member'),reason,before_value,after_value);
$$;
create function private.validate_calendar_restore(t uuid,b uuid,starts timestamptz,ends timestamptz,only_series uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare slot public.group_schedule_slots;occ record;
begin
 for slot in select * from public.group_schedule_slots where tenant_id=t and is_active and (b is null or branch_id=b) and (only_series is null or series_id=only_series) loop
  for occ in select * from private.schedule_occurrences(t,greatest(starts,now()),ends,slot.group_id,slot.teacher_id,slot.classroom_id) o where o.slot_id=slot.id and o.starts_at>=now() and o.starts_at<ends and starts<o.ends_at loop
   perform private.assert_booking(t,occ.group_id,occ.teacher_id,occ.classroom_id,occ.starts_at,occ.ends_at,null,occ.series_id,occ.day);
  end loop;
 end loop;
end $$;
create function public.save_academic_closure(p_tenant uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.academic_closures;payload jsonb;replay uuid;v_branch uuid;zone text;first_day date;last_day date;before_value jsonb;active boolean;
begin
 payload:=jsonb_build_object('command','save_closure','id',p_id,'version',p_version,'data',p_data);replay:=private.lms_request(p_tenant,p_request,payload);
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Enter valid non-teaching date details';end if;
 v_branch:=nullif(p_data->>'branch_id','')::uuid;
 if p_id is not null then
  select * into c from public.academic_closures where tenant_id=p_tenant and id=p_id for update;
  if not found or c.branch_id is distinct from v_branch then raise exception using errcode='42501',message='Closure scope cannot change';end if;
 end if;
 if not private.closure_allowed(p_tenant,v_branch,'schedules.manage_holidays') then raise exception using errcode='42501',message='Non-teaching date management denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from coalesce(c.version,0) then raise exception using errcode='40001',message='Closure changed; reload';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 150 or length(trim(coalesce(p_data->>'reason',''))) not between 3 and 1000 or jsonb_typeof(p_data->'is_active') is distinct from 'boolean' then raise exception 'Enter a closure name, reason and enabled state';end if;
 select coalesce(c.timezone,timezone) into zone from public.tenants where id=p_tenant;
 first_day:=private.lms_date(p_data->>'from_date');last_day:=private.lms_date(p_data->>'to_date');active:=(p_data->>'is_active')::boolean;
 if last_day<first_day or last_day-first_day>365 then raise exception 'Use a closure period of at most 366 dates';end if;
 if p_id is null and v_branch is not null and not exists(select 1 from public.branches where tenant_id=p_tenant and id=v_branch and is_active) then raise exception 'Choose an active authorized closure branch';end if;
 before_value:=case when c.id is null then null else to_jsonb(c) end;
 if p_id is null then insert into public.academic_closures(tenant_id,branch_id,name,reason,from_date,to_date,timezone,is_active,created_by)
  values(p_tenant,v_branch,trim(p_data->>'name'),trim(p_data->>'reason'),first_day,last_day,zone,active,auth.uid()) returning * into c;
 else update public.academic_closures set name=trim(p_data->>'name'),reason=trim(p_data->>'reason'),from_date=first_day,to_date=last_day,is_active=active,version=version+1,updated_at=now() where id=c.id returning * into c;
 end if;
 if before_value is not null and (before_value->>'is_active')::boolean then
  perform private.validate_calendar_restore(p_tenant,v_branch,(before_value->>'from_date')::date::timestamp at time zone zone,((before_value->>'to_date')::date+1)::timestamp at time zone zone);
 end if;
 perform private.calendar_audit(p_tenant,c.id,null,case when p_id is null then 'closure_created' else 'closure_updated' end,before_value,to_jsonb(c),c.reason);
 perform private.lms_finish(p_tenant,p_request,payload,c.id);return c.id;
end $$;

create function public.save_schedule_exception(p_tenant uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.group_schedule_exceptions;s public.group_schedule_slots;v_series uuid;v_day date;payload jsonb;replay uuid;before_value jsonb;active boolean;
begin
 payload:=jsonb_build_object('command','save_occurrence_exception','id',p_id,'version',p_version,'data',p_data);replay:=private.lms_request(p_tenant,p_request,payload);
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Enter valid occurrence exception details';end if;
 v_series:=(p_data->>'series_id')::uuid;v_day:=private.lms_date(p_data->>'occurrence_date');
 select * into s from public.group_schedule_slots where tenant_id=p_tenant and series_id=v_series and v_day between effective_from and effective_to and extract(isodow from v_day)=weekday order by is_active desc,created_at desc,id limit 1;
 if not found or not private.schedule_allowed(p_tenant,s.group_id,'schedules.manage') then raise exception using errcode='42501',message='Choose an authorized weekly occurrence';end if;
 if v_day<(now() at time zone s.timezone)::date then raise exception 'Only current or future weekly occurrences can be changed';end if;
 if p_id is not null then select * into e from public.group_schedule_exceptions where tenant_id=p_tenant and id=p_id for update;
  if not found or e.series_id<>v_series or e.occurrence_date<>v_day then raise exception using errcode='42501',message='Occurrence exception scope cannot change';end if;
 end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from coalesce(e.version,0) then raise exception using errcode='40001',message='Occurrence exception changed; reload';end if;
 if length(trim(coalesce(p_data->>'reason',''))) not between 3 and 1000 or jsonb_typeof(p_data->'is_active') is distinct from 'boolean' then raise exception 'Enter an occurrence reason and enabled state';end if;
 active:=(p_data->>'is_active')::boolean;before_value:=case when e.id is null then null else to_jsonb(e) end;
 if p_id is null then insert into public.group_schedule_exceptions(tenant_id,group_id,branch_id,series_id,occurrence_date,reason,is_active,created_by)
  values(p_tenant,s.group_id,s.branch_id,v_series,v_day,trim(p_data->>'reason'),active,auth.uid()) returning * into e;
 else update public.group_schedule_exceptions set reason=trim(p_data->>'reason'),is_active=active,version=version+1,updated_at=now() where id=e.id returning * into e;
 end if;
 if not active then perform private.validate_calendar_restore(p_tenant,s.branch_id,(v_day-2)::timestamp at time zone 'UTC',(v_day+3)::timestamp at time zone 'UTC',v_series);end if;
 perform private.calendar_audit(p_tenant,null,e.id,case when p_id is null then 'occurrence_exception_created' else 'occurrence_exception_updated' end,before_value,to_jsonb(e),e.reason);
 perform private.lms_finish(p_tenant,p_request,payload,e.id);return e.id;
end $$;
revoke all on function private.calendar_audit(uuid,uuid,uuid,text,jsonb,jsonb,text),private.validate_calendar_restore(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.save_academic_closure(uuid,uuid,uuid,integer,jsonb),public.save_schedule_exception(uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_academic_closure(uuid,uuid,uuid,integer,jsonb),public.save_schedule_exception(uuid,uuid,uuid,integer,jsonb) to authenticated;
