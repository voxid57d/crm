create function private.attendance_counts(t uuid,s uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('expected',count(*) filter(where is_expected),'excluded',count(*) filter(where not is_expected),
 'unmarked',count(*) filter(where is_expected and status='unmarked'),'present',count(*) filter(where is_expected and status='present'),
 'absent',count(*) filter(where is_expected and status='absent'),'late',count(*) filter(where is_expected and status='late'),'excused',count(*) filter(where is_expected and status='excused'))
 from public.lesson_attendance_records where tenant_id=t and sheet_id=s;
$$;
create function private.attendance_audit(t uuid,s uuid,operation text,before_value jsonb,after_value jsonb,reason text default '',record uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.attendance_events(tenant_id,sheet_id,lesson_id,group_id,branch_id,record_id,sheet_version,operation,actor_id,actor_name,reason,before_data,after_data)
 select t,id,lesson_id,group_id,branch_id,record,version,operation,auth.uid(),coalesce((select nullif(trim(full_name),'') from public.profiles where id=auth.uid()),'Business member'),reason,before_value,after_value
 from public.lesson_attendance_sheets where tenant_id=t and id=s;
$$;
create function private.attendance_open(t uuid,l uuid,p text) returns public.lessons language plpgsql security definer set search_path='' as $$
declare result public.lessons;
begin
 if not private.attendance_allowed(t,l,p) then raise exception using errcode='42501',message='Attendance operation denied';end if;
 select * into result from public.lessons where tenant_id=t and id=l for update;
 if result.status in ('cancelled','rescheduled') then raise exception 'Cancelled and rescheduled lessons retain history but cannot record ordinary attendance';end if;
 if result.starts_at>now() then raise exception 'Attendance cannot be recorded before the lesson starts';end if;
 return result;
end $$;

create function public.prepare_attendance_sheet(p_tenant uuid,p_lesson uuid,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;s public.lesson_attendance_sheets;payload jsonb;replay uuid;
begin
 payload:=jsonb_build_object('command','prepare_attendance','lesson',p_lesson);replay:=private.lms_request(p_tenant,p_request,payload);
 l:=private.attendance_open(p_tenant,p_lesson,'attendance.manage');
 if replay is not null then return replay;end if;
 select * into s from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=p_lesson;
 if not found then
  insert into public.lesson_attendance_sheets(tenant_id,lesson_id,group_id,branch_id,created_by) values(p_tenant,l.id,l.group_id,l.branch_id,auth.uid()) returning * into s;
  insert into public.lesson_attendance_records(tenant_id,sheet_id,lesson_id,group_id,branch_id,enrollment_id,customer_id,updated_by)
  select p_tenant,s.id,l.id,l.group_id,l.branch_id,r.enrollment_id,r.customer_id,auth.uid() from private.attendance_roster(p_tenant,l.id) r;
  perform private.attendance_audit(p_tenant,s.id,'prepared',null,private.attendance_counts(p_tenant,s.id));
 end if;
 perform private.lms_finish(p_tenant,p_request,payload,s.id);return s.id;
end $$;

create function public.save_attendance_marks(p_tenant uuid,p_lesson uuid,p_request uuid,p_version integer,p_marks jsonb,p_correct boolean default false,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;s public.lesson_attendance_sheets;r public.lesson_attendance_records;payload jsonb;replay uuid;item jsonb;state text;note text;minutes integer;before_value jsonb;changed integer:=0;employee uuid;
begin
 payload:=jsonb_build_object('command','save_attendance','lesson',p_lesson,'version',p_version,'marks',p_marks,'correct',p_correct,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 if p_correct is null then raise exception 'Choose a draft save or finalized correction';end if;
 l:=private.attendance_open(p_tenant,p_lesson,case when p_correct then 'attendance.correct' else 'attendance.manage' end);
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

create function public.refresh_attendance_roster(p_tenant uuid,p_lesson uuid,p_request uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;s public.lesson_attendance_sheets;payload jsonb;replay uuid;r public.lesson_attendance_records;expected record;before_value jsonb;
begin
 payload:=jsonb_build_object('command','refresh_attendance','lesson',p_lesson,'version',p_version);replay:=private.lms_request(p_tenant,p_request,payload);
 l:=private.attendance_open(p_tenant,p_lesson,'attendance.manage');if replay is not null then return replay;end if;
 select * into s from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=p_lesson for update;
 if not found or s.state<>'draft' then raise exception 'Only draft attendance rosters can be reviewed';end if;
 if p_version is distinct from s.version then raise exception using errcode='40001',message='Attendance changed; reload before saving';end if;
 if exists(select 1 from public.lesson_attendance_records a where a.tenant_id=p_tenant and a.sheet_id=s.id and a.is_expected and a.status<>'unmarked'
  and not exists(select 1 from private.attendance_roster(p_tenant,p_lesson) x where x.customer_id=a.customer_id and x.enrollment_id=a.enrollment_id)) then raise exception 'Clear affected draft marks before reviewing changed roster references; their prior values remain audited';end if;
 before_value:=private.attendance_counts(p_tenant,s.id);
 update public.lesson_attendance_sheets set version=version+1,roster_reviewed_at=now(),updated_at=now() where id=s.id;
 for r in select * from public.lesson_attendance_records a where a.tenant_id=p_tenant and a.sheet_id=s.id and a.is_expected and not exists(select 1 from private.attendance_roster(p_tenant,p_lesson) x where x.customer_id=a.customer_id) loop
  update public.lesson_attendance_records set is_expected=false,updated_by=auth.uid(),updated_at=now() where id=r.id;
  perform private.attendance_audit(p_tenant,s.id,'roster_refreshed',to_jsonb(r),(select to_jsonb(x) from public.lesson_attendance_records x where x.id=r.id),'Enrollment roster reviewed',r.id);
 end loop;
 for expected in select * from private.attendance_roster(p_tenant,p_lesson) loop
  select * into r from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and customer_id=expected.customer_id;
  if not found then
   insert into public.lesson_attendance_records(tenant_id,sheet_id,lesson_id,group_id,branch_id,enrollment_id,customer_id,updated_by)
   values(p_tenant,s.id,l.id,l.group_id,l.branch_id,expected.enrollment_id,expected.customer_id,auth.uid()) returning * into r;
   perform private.attendance_audit(p_tenant,s.id,'roster_refreshed',null,to_jsonb(r),'Enrollment roster reviewed',r.id);
  elsif not r.is_expected or r.enrollment_id<>expected.enrollment_id then
   update public.lesson_attendance_records set is_expected=true,enrollment_id=expected.enrollment_id,updated_by=auth.uid(),updated_at=now() where id=r.id;
   perform private.attendance_audit(p_tenant,s.id,'roster_refreshed',to_jsonb(r),(select to_jsonb(x) from public.lesson_attendance_records x where x.id=r.id),'Enrollment roster reviewed',r.id);
  end if;
 end loop;
 perform private.attendance_audit(p_tenant,s.id,'roster_refreshed',before_value,private.attendance_counts(p_tenant,s.id));perform private.lms_finish(p_tenant,p_request,payload,s.id);return s.id;
end $$;

create function public.finalize_attendance_sheet(p_tenant uuid,p_lesson uuid,p_request uuid,p_version integer,p_confirm_empty boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.lessons;s public.lesson_attendance_sheets;payload jsonb;replay uuid;counts jsonb;
begin
 payload:=jsonb_build_object('command','finalize_attendance','lesson',p_lesson,'version',p_version,'confirm_empty',p_confirm_empty);replay:=private.lms_request(p_tenant,p_request,payload);
 l:=private.attendance_open(p_tenant,p_lesson,'attendance.finalize');if replay is not null then return replay;end if;
 select * into s from public.lesson_attendance_sheets where tenant_id=p_tenant and lesson_id=p_lesson for update;
 if not found or s.state<>'draft' then raise exception 'Choose a draft attendance sheet';end if;
 if p_version is distinct from s.version then raise exception using errcode='40001',message='Attendance changed; reload before saving';end if;
 if l.ends_at>now() then raise exception 'Attendance can be finalized after the scheduled lesson end';end if;
 if exists((select enrollment_id,customer_id from private.attendance_roster(p_tenant,p_lesson) except select enrollment_id,customer_id from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and is_expected)
 union all (select enrollment_id,customer_id from public.lesson_attendance_records where tenant_id=p_tenant and sheet_id=s.id and is_expected except select enrollment_id,customer_id from private.attendance_roster(p_tenant,p_lesson))) then raise exception 'Enrollment roster changed; review the draft roster before finalizing';end if;
 counts:=private.attendance_counts(p_tenant,s.id);
 if (counts->>'unmarked')::integer>0 then raise exception 'Mark every expected student before finalizing; Unmarked is not Absent';end if;
 if (counts->>'expected')::integer=0 and p_confirm_empty is distinct from true then raise exception 'Explicitly confirm the empty expected roster';end if;
 update public.lesson_attendance_sheets set state='finalized',version=version+1,finalized_at=now(),finalized_by=auth.uid(),updated_at=now() where id=s.id;
 perform private.attendance_audit(p_tenant,s.id,'finalized',jsonb_build_object('state','draft'),counts||jsonb_build_object('state','finalized'));
 perform private.lms_finish(p_tenant,p_request,payload,s.id);return s.id;
end $$;
revoke all on function private.attendance_counts(uuid,uuid),private.attendance_audit(uuid,uuid,text,jsonb,jsonb,text,uuid),private.attendance_open(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.prepare_attendance_sheet(uuid,uuid,uuid),public.save_attendance_marks(uuid,uuid,uuid,integer,jsonb,boolean,text),public.refresh_attendance_roster(uuid,uuid,uuid,integer),public.finalize_attendance_sheet(uuid,uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.prepare_attendance_sheet(uuid,uuid,uuid),public.save_attendance_marks(uuid,uuid,uuid,integer,jsonb,boolean,text),public.refresh_attendance_roster(uuid,uuid,uuid,integer),public.finalize_attendance_sheet(uuid,uuid,uuid,integer,boolean) to authenticated;
