create function private.academic_instant(local_value text,zone text) returns timestamptz language plpgsql stable set search_path='' as $$
declare wall timestamp;instant timestamptz;matches integer;
begin
 if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) or local_value is null or local_value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then raise exception 'Choose a valid local date/time and IANA timezone';end if;
 wall:=local_value::timestamp;instant:=wall at time zone zone;
 select count(distinct candidate) into matches from (
 select (wall at time zone 'UTC')-((sample at time zone zone)-(sample at time zone 'UTC')) candidate
 from generate_series(instant-interval '2 days',instant+interval '2 days',interval '6 hours') sample) c where candidate at time zone zone=wall;
 if matches<>1 then raise exception 'Ambiguous or nonexistent local time; choose an unambiguous time or split the effective schedule period';end if;return instant;
end $$;
create function private.schedule_clock(value text) returns time language plpgsql stable set search_path='' as $$
begin if value is null or value!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a valid local time in HH:MM format';end if;return value::time;end $$;
create function private.schedule_occurrences(t uuid,range_start timestamptz,range_end timestamptz,g uuid,teacher uuid,room uuid)
returns table(slot_id uuid,series_id uuid,group_id uuid,teacher_id uuid,classroom_id uuid,day date,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.id,s.series_id,s.group_id,s.teacher_id,s.classroom_id,d::date,
 private.academic_instant(to_char(d,'YYYY-MM-DD')||'T'||to_char(s.start_time,'HH24:MI'),s.timezone),private.academic_instant(to_char(d,'YYYY-MM-DD')||'T'||to_char(s.end_time,'HH24:MI'),s.timezone)
 from public.group_schedule_slots s cross join lateral generate_series(greatest(s.effective_from,(range_start at time zone s.timezone)::date-1)::timestamp,least(s.effective_to,(range_end at time zone s.timezone)::date+1)::timestamp,interval '1 day') d
 where s.tenant_id=t and s.is_active and (s.group_id=g or s.teacher_id=teacher or (room is not null and s.classroom_id=room)) and extract(isodow from d)=s.weekday
 and not exists(select 1 from public.lessons l where l.tenant_id=t and l.series_id=s.series_id and l.occurrence_date=d::date and l.rescheduled_from_id is null);
$$;
create function private.assert_booking(t uuid,g uuid,teacher uuid,room uuid,starts timestamptz,ends timestamptz,except_lesson uuid default null,origin_series uuid default null,origin_date date default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.lessons l where l.tenant_id=t and l.id is distinct from except_lesson and l.status in ('scheduled','in_progress','completed') and l.starts_at<ends and starts<l.ends_at
 and (l.group_id=g or l.effective_teacher_id=teacher or (room is not null and l.classroom_id=room))) then raise exception using errcode='23P01',message='Lesson conflict: group, teaching employee or classroom is already booked';end if;
 if exists(select 1 from private.schedule_occurrences(t,starts,ends,g,teacher,room) s where s.starts_at<ends and starts<s.ends_at and not(s.series_id is not distinct from origin_series and s.day is not distinct from origin_date)) then raise exception using errcode='23P01',message='Schedule conflict: an ungenerated weekly occurrence reserves this resource';end if;
end $$;
create function private.teaching_resources(t uuid,g uuid,teacher uuid,substitute uuid,room uuid,zone text,starts timestamptz,ends timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare grp public.study_groups;
begin
 select * into grp from public.study_groups where tenant_id=t and id=g;
 if not found or grp.status not in ('planned','active') or not exists(select 1 from public.branches where tenant_id=t and id=grp.branch_id and is_active) then raise exception 'Choose a planned/active group in an active branch';end if;
 if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) or starts is null or ends is null or not isfinite(starts) or not isfinite(ends) or ends<=starts or ends-starts>interval '24 hours' then raise exception 'Invalid timezone or lesson start/end (maximum 24 hours)';end if;
 if (starts at time zone zone)::date<grp.start_date or (grp.end_date is not null and (ends at time zone zone)::date>grp.end_date) then raise exception 'Lesson dates must fit the group period';end if;
 if not private.employee_can_teach(t,teacher,grp.branch_id) or not exists(select 1 from public.group_teacher_assignments where tenant_id=t and group_id=g and employee_id=teacher and ended_at is null) then raise exception 'Primary teacher needs an active eligible assignment to this group';end if;
 if substitute is not null and (substitute=teacher or not private.employee_can_teach(t,substitute,grp.branch_id)) then raise exception 'Substitute must be a different eligible branch teaching employee';end if;
 if room is not null and not exists(select 1 from public.classrooms where tenant_id=t and id=room and branch_id=grp.branch_id and is_active and capacity>=grp.capacity) then raise exception 'Choose an active same-branch classroom covering group capacity';end if;
end $$;
create function private.capture_expected_roster(t uuid,lesson uuid) returns void language sql security definer set search_path='' as $$
 insert into public.lesson_expected_students(tenant_id,lesson_id,group_id,branch_id,enrollment_id,customer_id)
 select distinct on(e.customer_id) t,l.id,l.group_id,l.branch_id,e.id,e.customer_id from public.lessons l join public.student_enrollments e on e.tenant_id=t and e.group_id=l.group_id
 where l.tenant_id=t and l.id=lesson and e.status in ('active','completed','withdrawn') and e.effective_start_date<=(l.starts_at at time zone l.timezone)::date and (e.effective_end_date is null or e.effective_end_date>=(l.starts_at at time zone l.timezone)::date)
 order by e.customer_id,case when e.status='active' then 0 else 1 end,e.effective_start_date desc,e.created_at desc,e.id on conflict do nothing;
$$;
create function private.schedule_slot_guard() returns trigger language plpgsql security definer set search_path='' as $$
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
 if not exists(select 1 from public.lessons where tenant_id=new.tenant_id and series_id=new.series_id and occurrence_date=d and rescheduled_from_id is null) then
 perform private.assert_booking(new.tenant_id,new.group_id,new.teacher_id,new.classroom_id,starts,ends,null,new.series_id,d);end if;end loop;
 -- Validate resources even for short periods containing no matching weekday.
 if not private.employee_can_teach(new.tenant_id,new.teacher_id,grp.branch_id) or not exists(select 1 from public.group_teacher_assignments where tenant_id=new.tenant_id and group_id=new.group_id and employee_id=new.teacher_id and ended_at is null) then raise exception 'Primary teacher needs an active eligible assignment to this group';end if;
 return new;
end $$;
create trigger schedule_slots_guard before insert or update or delete on public.group_schedule_slots for each row execute function private.schedule_slot_guard();
create function private.lesson_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Lesson history is retained';end if;
 perform 1 from public.tenants where id=new.tenant_id for update;
 if tg_op='UPDATE' then
 if old.status in ('completed','cancelled','rescheduled') then raise exception 'Completed and terminal lessons cannot be overwritten';end if;
 if (new.id,new.tenant_id,new.group_id,new.branch_id,new.series_id,new.schedule_slot_id,new.occurrence_date,new.schedule_version,new.rescheduled_from_id,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.group_id,old.branch_id,old.series_id,old.schedule_slot_id,old.occurrence_date,old.schedule_version,old.rescheduled_from_id,old.created_by,old.created_at) then raise exception 'Lesson identity and occurrence cannot change';end if;
 if new.version<>old.version+1 then raise exception 'Lesson version must advance once';end if;
 if (new.starts_at,new.ends_at) is distinct from (old.starts_at,old.ends_at) then raise exception 'Use rescheduling to move lesson times';end if;
 if (new.teacher_id,new.substitute_id,new.classroom_id,new.timezone,new.title,new.notes) is distinct from (old.teacher_id,old.substitute_id,old.classroom_id,old.timezone,old.title,old.notes) then
 if old.status<>'scheduled' or old.starts_at<=now() then raise exception 'Only upcoming scheduled lesson details can be edited';end if;
 perform private.teaching_resources(new.tenant_id,new.group_id,new.teacher_id,new.substitute_id,new.classroom_id,new.timezone,new.starts_at,new.ends_at);end if;
 if (old.status='scheduled' and new.status not in ('scheduled','in_progress','completed','cancelled','rescheduled')) or (old.status='in_progress' and new.status not in ('completed','cancelled')) then raise exception 'Unsupported lesson status transition';end if;
 if new.roster_captured_at is distinct from old.roster_captured_at then raise exception 'Expected roster capture is managed by lesson lifecycle';end if;
 if new.status in ('in_progress','completed') and old.roster_captured_at is null then perform private.capture_expected_roster(new.tenant_id,new.id);new.roster_captured_at:=now();end if;
 else
 if new.status<>'scheduled' or new.roster_captured_at is not null then raise exception 'New lessons must be scheduled';end if;
 perform private.teaching_resources(new.tenant_id,new.group_id,new.teacher_id,new.substitute_id,new.classroom_id,new.timezone,new.starts_at,new.ends_at);
 end if;
 if new.status='in_progress' and new.starts_at>now() then raise exception 'Lesson cannot start before scheduled time';end if;
 if new.status='completed' and new.ends_at>now() then raise exception 'Lesson cannot complete before scheduled end';end if;
 if new.status in ('scheduled','in_progress','completed') then perform private.assert_booking(new.tenant_id,new.group_id,coalesce(new.substitute_id,new.teacher_id),new.classroom_id,new.starts_at,new.ends_at,new.id,new.series_id,new.occurrence_date);end if;
 return new;
end $$;
create trigger lessons_guard before insert or update or delete on public.lessons for each row execute function private.lesson_guard();
create function private.lesson_reschedule_integrity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='rescheduled' and not exists(select 1 from public.lessons where tenant_id=new.tenant_id and rescheduled_from_id=new.id) then raise exception using errcode='23514',message='Rescheduled lesson must retain a replacement';end if;
 if new.rescheduled_from_id is not null and not exists(select 1 from public.lessons where tenant_id=new.tenant_id and id=new.rescheduled_from_id and status='rescheduled') then raise exception using errcode='23514',message='Replacement lesson must retain a rescheduled source';end if;return null;
end $$;
create constraint trigger lesson_reschedule_integrity after insert or update on public.lessons deferrable initially deferred for each row execute function private.lesson_reschedule_integrity();
create function private.group_lesson_resources_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','cancelled','archived') and exists(select 1 from public.lessons where tenant_id=new.tenant_id and group_id=new.id and status in ('scheduled','in_progress')) then raise exception 'Finish or cancel outstanding lessons before closing the group';end if;
 if (new.start_date,new.end_date) is distinct from (old.start_date,old.end_date) and (exists(select 1 from public.lessons where tenant_id=new.tenant_id and group_id=new.id and ((starts_at at time zone timezone)::date<new.start_date or (new.end_date is not null and (ends_at at time zone timezone)::date>new.end_date))) or exists(select 1 from public.group_schedule_slots where tenant_id=new.tenant_id and group_id=new.id and is_active and (effective_from<new.start_date or (new.end_date is not null and effective_to>new.end_date)))) then raise exception 'Group dates must retain schedule and lesson periods';end if;
 if new.capacity>old.capacity and (exists(select 1 from public.lessons l join public.classrooms r on r.tenant_id=l.tenant_id and r.id=l.classroom_id where l.tenant_id=new.tenant_id and l.group_id=new.id and l.status in ('scheduled','in_progress') and r.capacity<new.capacity) or exists(select 1 from public.group_schedule_slots s join public.classrooms r on r.tenant_id=s.tenant_id and r.id=s.classroom_id where s.tenant_id=new.tenant_id and s.group_id=new.id and s.is_active and s.effective_to>=(now() at time zone s.timezone)::date and r.capacity<new.capacity)) then raise exception 'Group capacity exceeds an assigned teaching classroom';end if;return new;
end $$;
create trigger group_lesson_resources_guard before update on public.study_groups for each row execute function private.group_lesson_resources_guard();
create function private.room_lesson_resources_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.capacity<old.capacity and (exists(select 1 from public.lessons l join public.study_groups g on g.tenant_id=l.tenant_id and g.id=l.group_id where l.tenant_id=new.tenant_id and l.classroom_id=new.id and l.status in ('scheduled','in_progress') and g.capacity>new.capacity) or exists(select 1 from public.group_schedule_slots s join public.study_groups g on g.tenant_id=s.tenant_id and g.id=s.group_id where s.tenant_id=new.tenant_id and s.classroom_id=new.id and s.is_active and s.effective_to>=(now() at time zone s.timezone)::date and g.capacity>new.capacity)) then raise exception 'Classroom capacity must cover scheduled teaching groups';end if;return new;
end $$;
create trigger room_lesson_resources_guard before update on public.classrooms for each row execute function private.room_lesson_resources_guard();
revoke all on function private.academic_instant(text,text),private.schedule_clock(text),private.schedule_occurrences(uuid,timestamptz,timestamptz,uuid,uuid,uuid),private.assert_booking(uuid,uuid,uuid,uuid,timestamptz,timestamptz,uuid,uuid,date),private.teaching_resources(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz),private.capture_expected_roster(uuid,uuid),private.schedule_slot_guard(),private.lesson_guard(),private.lesson_reschedule_integrity(),private.group_lesson_resources_guard(),private.room_lesson_resources_guard() from public,anon,authenticated;
