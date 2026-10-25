-- Retain the checked command contract while removing an unused composite local.
create or replace function public.save_attendance_marks(p_tenant uuid,p_lesson uuid,p_request uuid,p_version integer,p_marks jsonb,p_correct boolean default false,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare s public.lesson_attendance_sheets;r public.lesson_attendance_records;payload jsonb;replay uuid;item jsonb;state text;note text;minutes integer;before_value jsonb;changed integer:=0;employee uuid;
begin
 payload:=jsonb_build_object('command','save_attendance','lesson',p_lesson,'version',p_version,'marks',p_marks,'correct',p_correct,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 if p_correct is null then raise exception 'Choose a draft save or finalized correction';end if;
 perform private.attendance_open(p_tenant,p_lesson,case when p_correct then 'attendance.correct' else 'attendance.manage' end);
 if replay is not null then return replay;end if;
 select * into s from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=p_lesson for update;
 if not found then raise exception 'Prepare the attendance sheet first';end if;
 if p_version is distinct from s.version then raise exception using errcode='40001',message='Attendance changed; reload before saving';end if;
 if (p_correct and s.state<>'finalized') or (not p_correct and s.state<>'draft') then raise exception 'Finalized attendance requires the explicit correction action';end if;
 if p_reason is null or length(p_reason)>1000 or (p_correct and length(trim(p_reason))<3) then raise exception 'A correction reason of 3 to 1000 characters is required';end if;
 if jsonb_typeof(p_marks) is distinct from 'array' or jsonb_array_length(p_marks) not between 1 and 200 then raise exception 'Save between 1 and 200 attendance rows at a time';end if;
 if (select count(distinct value->>'record_id') from jsonb_array_elements(p_marks))<>jsonb_array_length(p_marks) then raise exception 'Duplicate or missing attendance row IDs';end if;
 select id into employee from public.employees where tenant_id=p_tenant and user_id=auth.uid() and status='active';
 before_value:=private.attendance_counts(p_tenant,s.id);
 update public.lesson_attendance_sheets set version=version+1,updated_at=now(),correction_count=correction_count+case when p_correct then 1 else 0 end,
 corrected_at=case when p_correct then now() else corrected_at end,corrected_by=case when p_correct then auth.uid() else corrected_by end where id=s.id;
 for item in select value from jsonb_array_elements(p_marks) loop
  select * into r from public.lesson_attendance_records where tenant_id=p_tenant and id=(item->>'record_id')::uuid and sheet_id=s.id and is_expected for update;
  if not found then raise exception using errcode='42501',message='Choose an expected student from this attendance sheet';end if;
  state:=item->>'status';note:=coalesce(item->>'notes','');minutes:=null;
  if state is null or state not in ('unmarked','present','absent','late','excused') or length(note)>1000 then raise exception 'Choose a supported attendance status and a note of at most 1000 characters';end if;
  if p_correct and state='unmarked' then raise exception 'A finalized correction must keep every expected student marked';end if;
  if nullif(item->>'late_minutes','') is not null then
   if state<>'late' or (item->>'late_minutes')!~'^[0-9]{1,4}$' or (item->>'late_minutes')::integer not between 1 and 1440 then raise exception 'Late minutes must be 1 to 1440 for a Late mark only';end if;minutes:=(item->>'late_minutes')::integer;
  end if;
  if (r.status,r.notes,r.late_minutes) is distinct from (state,note,minutes) then
   update public.lesson_attendance_records set status=state,notes=note,late_minutes=minutes,marked_by=case when state<>'unmarked' then auth.uid() end,
   marked_employee_id=case when state<>'unmarked' then employee end,marked_at=case when state<>'unmarked' then now() end,updated_by=auth.uid(),updated_at=now() where id=r.id;
   perform private.attendance_audit(p_tenant,s.id,case when p_correct then 'corrected' else 'draft_saved' end,to_jsonb(r),(select to_jsonb(x) from public.lesson_attendance_records x where x.id=r.id),trim(p_reason),r.id);changed:=changed+1;
  end if;
 end loop;
 if p_correct and changed=0 then raise exception 'Change at least one attendance value for a correction';end if;
 perform private.attendance_audit(p_tenant,s.id,case when p_correct then 'corrected' else 'draft_saved' end,before_value,private.attendance_counts(p_tenant,s.id)||jsonb_build_object('changed_records',changed),trim(p_reason));
 perform private.lms_finish(p_tenant,p_request,payload,s.id);return s.id;
end $$;

create function public.can_view_attendance(p_tenant uuid,p_lesson uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.attendance_allowed(p_tenant,p_lesson);
$$;
revoke all on function public.can_view_attendance(uuid,uuid) from public,anon;
grant execute on function public.can_view_attendance(uuid,uuid) to authenticated;
