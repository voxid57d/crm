create function private.lms_date(value text,optional boolean default false) returns date language plpgsql immutable set search_path='' as $$
begin
 if optional and nullif(value,'') is null then return null;end if;
 if value is null or value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a valid date';end if;return value::date;
end $$;
create function private.lms_request(t uuid,request uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare receipt public.lms_commands;
begin
 if request is null or not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Academic command denied';end if;
 -- Shared with catalog commands: bounded, short transactions serialize writes per business.
 perform 1 from public.tenants where id=t for update;
 select * into receipt from public.lms_commands where tenant_id=t and request_id=request;
 if found then if receipt.actor_id<>auth.uid() or receipt.payload<>payload then raise exception 'Academic request identifier reused with different details';end if;return receipt.result_id;end if;return null;
end $$;
create function private.lms_finish(t uuid,request uuid,payload jsonb,result uuid) returns void language sql security definer set search_path='' as $$
 insert into public.lms_commands(tenant_id,request_id,actor_id,payload,result_id) values(t,request,auth.uid(),payload,result);
$$;
create function private.lms_document(t uuid,kind text,identifier uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;
begin
 if kind='group' then
 select to_jsonb(g)||jsonb_build_object('course_name',c.name,'branch_name',b.name,'classroom_name',r.name,'teachers',coalesce((select jsonb_agg(jsonb_build_object('employee_id',a.employee_id,'name',e.full_name,'is_primary',a.is_primary) order by a.is_primary desc,e.full_name,a.id) from public.group_teacher_assignments a join public.employees e on e.tenant_id=t and e.id=a.employee_id where a.tenant_id=t and a.group_id=g.id and a.ended_at is null),'[]')) into doc
 from public.study_groups g join public.courses c on c.tenant_id=t and c.id=g.course_id join public.branches b on b.tenant_id=t and b.id=g.branch_id left join public.classrooms r on r.tenant_id=t and r.id=g.classroom_id where g.tenant_id=t and g.id=identifier;
 elsif kind='enrollment' then
 select (to_jsonb(e)-'agreed_price')||jsonb_build_object('agreed_price',round(e.agreed_price,2)::text) into doc from public.student_enrollments e where tenant_id=t and id=identifier;
 else raise exception 'Invalid academic document';end if;return doc;
end $$;
create function private.lms_audit(t uuid,g uuid,e uuid,operation text,before_value jsonb,after_value jsonb,reason text default '') returns void language sql security definer set search_path='' as $$
 insert into public.lms_events(tenant_id,branch_id,group_id,enrollment_id,operation,actor_id,actor_name,reason,before_data,after_data)
 select t,branch_id,g,e,operation,auth.uid(),coalesce((select nullif(trim(full_name),'') from public.profiles where id=auth.uid()),'Business member'),reason,before_value,after_value from public.study_groups where tenant_id=t and id=g;
$$;
create function private.group_resources(t uuid,b uuid,c uuid,r uuid,capacity integer,allow_old_room uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.branches where tenant_id=t and id=b and is_active) then raise exception 'Choose an active branch';end if;
 if not exists(select 1 from public.courses where tenant_id=t and id=c) then raise exception 'Course is not in this business';end if;
 if r is not null and (not private.classroom_allowed(t,r) or not exists(select 1 from public.classrooms where tenant_id=t and id=r and branch_id=b and (is_active or id=allow_old_room) and public.classrooms.capacity>=group_resources.capacity)) then raise exception 'Choose an active authorized same-branch classroom with sufficient capacity';end if;
end $$;
create function public.save_study_group(p_tenant uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.study_groups;b uuid;c uuid;r uuid;cap integer;starts date;ends date;payload jsonb;replay uuid;before_value jsonb;result uuid;
begin
 payload:=jsonb_build_object('command','save_group','id',p_id,'version',p_version,'data',p_data);replay:=private.lms_request(p_tenant,p_request,payload);
 if jsonb_typeof(p_data) is distinct from 'object' or length(trim(coalesce(p_data->>'name',''))) not between 1 and 150 or length(coalesce(p_data->>'code',''))>40 then raise exception 'Invalid group name or code';end if;
 b:=(p_data->>'branch_id')::uuid;c:=(p_data->>'course_id')::uuid;r:=nullif(p_data->>'classroom_id','')::uuid;cap:=private.academic_integer(p_data->>'capacity',1,10000);starts:=private.lms_date(p_data->>'start_date');ends:=private.lms_date(p_data->>'end_date',true);
 if p_id is not null then
 select * into g from public.study_groups where tenant_id=p_tenant and id=p_id for update;
 if not found or not private.group_allowed(p_tenant,p_id,'groups.update') then raise exception using errcode='42501',message='Group update denied';end if;
 if b is distinct from g.branch_id or c is distinct from g.course_id then raise exception 'Group branch and course cannot change';end if;
 else if not private.has_permission(p_tenant,'groups.view',b) or not private.has_permission(p_tenant,'groups.create',b) or not private.course_catalog_allowed(p_tenant) then raise exception using errcode='42501',message='Group creation denied';end if;end if;
 if replay is not null then return replay;end if;
 if p_id is null and p_version is distinct from 0 or p_id is not null and p_version is distinct from g.version then raise exception using errcode='40001',message='Group changed; reload';end if;
 if p_id is null and not exists(select 1 from public.courses where tenant_id=p_tenant and id=c and is_active) then raise exception 'Choose an active course';end if;
 if g.status in ('completed','cancelled','archived') then raise exception 'Terminal groups retain their configuration';end if;
 perform private.group_resources(p_tenant,b,c,r,cap,g.classroom_id);
 if ends<starts then raise exception 'Group end date must follow start date';end if;
 if exists(select 1 from public.student_enrollments where tenant_id=p_tenant and group_id=p_id and (effective_start_date<starts or (ends is not null and coalesce(effective_end_date,effective_start_date)>ends))) then raise exception 'Group dates must retain all enrollment periods';end if;
 if cap<(select count(*) from public.student_enrollments where tenant_id=p_tenant and group_id=p_id and status in ('pending','active','paused')) then raise exception 'Capacity cannot be below reserved seats';end if;
 if p_id is null then
 insert into public.study_groups(tenant_id,branch_id,course_id,name,code,start_date,end_date,capacity,classroom_id,created_by) values(p_tenant,b,c,trim(p_data->>'name'),nullif(trim(p_data->>'code'),''),starts,ends,cap,r,auth.uid()) returning id into result;
 else
 before_value:=private.lms_document(p_tenant,'group',p_id);
 update public.study_groups set name=trim(p_data->>'name'),code=nullif(trim(p_data->>'code'),''),start_date=starts,end_date=ends,capacity=cap,classroom_id=r,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id returning id into result;
 end if;
 perform private.lms_audit(p_tenant,result,null,case when p_id is null then 'group_created' else 'group_updated' end,before_value,private.lms_document(p_tenant,'group',result));perform private.lms_finish(p_tenant,p_request,payload,result);return result;
end $$;
create function public.change_group_status(p_tenant uuid,p_group uuid,p_request uuid,p_version integer,p_status text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.study_groups;payload jsonb;replay uuid;before_value jsonb;
begin
 payload:=jsonb_build_object('command','group_status','id',p_group,'version',p_version,'status',p_status,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into g from public.study_groups where tenant_id=p_tenant and id=p_group for update;
 if not found or not private.group_allowed(p_tenant,p_group,case when p_status='archived' then 'groups.archive' else 'groups.update' end) then raise exception using errcode='42501',message='Group status denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from g.version then raise exception using errcode='40001',message='Group changed; reload';end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 1000 or p_status is null then raise exception 'A reason of 3 to 1000 characters is required';end if;
 if not ((g.status='planned' and p_status in ('active','cancelled')) or (g.status='active' and p_status in ('paused','completed','cancelled')) or (g.status='paused' and p_status in ('active','completed','cancelled')) or (g.status in ('completed','cancelled') and p_status='archived')) then raise exception 'Unsupported group status transition';end if;
 if p_status in ('completed','cancelled','archived') and exists(select 1 from public.student_enrollments where tenant_id=p_tenant and group_id=p_group and status in ('pending','active','paused')) then raise exception 'Close reserved enrollments before completing, cancelling or archiving the group';end if;
 if p_status='active' then
 perform private.group_resources(p_tenant,g.branch_id,g.course_id,g.classroom_id,g.capacity);
 if g.status='planned' and not exists(select 1 from public.courses where tenant_id=p_tenant and id=g.course_id and is_active) then raise exception 'Activate the course before starting this group';end if;end if;
 before_value:=private.lms_document(p_tenant,'group',p_group);update public.study_groups set status=p_status,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_group;
 perform private.lms_audit(p_tenant,p_group,null,'group_status',before_value,private.lms_document(p_tenant,'group',p_group),trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,p_group);return p_group;
end $$;
create function public.set_group_teachers(p_tenant uuid,p_group uuid,p_request uuid,p_version integer,p_employees uuid[],p_primary uuid,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare g public.study_groups;ids uuid[];payload jsonb;replay uuid;before_value jsonb;
begin
 select coalesce(array_agg(e order by e),'{}') into ids from (select distinct unnest(p_employees) e) s;
 payload:=jsonb_build_object('command','teachers','id',p_group,'version',p_version,'employees',ids,'primary',p_primary,'reason',p_reason);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into g from public.study_groups where tenant_id=p_tenant and id=p_group for update;
 if not found or not private.group_allowed(p_tenant,p_group,'groups.assign_teachers') then raise exception using errcode='42501',message='Teacher assignment denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from g.version then raise exception using errcode='40001',message='Group changed; reload';end if;
 if g.status in ('completed','cancelled','archived') then raise exception 'Terminal teacher assignments are retained';end if;
 if p_reason is null or length(p_reason)>1000 or cardinality(ids)>30 or array_position(ids,null) is not null or
 (cardinality(ids)=0 and p_primary is not null) or (cardinality(ids)>0 and (p_primary is null or not(p_primary=any(ids)))) then raise exception 'Select up to 30 teachers and exactly one selected primary teacher';end if;
 if exists(select 1 from unnest(ids) e where not private.employee_can_teach(p_tenant,e,g.branch_id)) then raise exception 'Every teacher must be an active linked employee with branch teaching permission';end if;
 before_value:=private.lms_document(p_tenant,'group',p_group);
 update public.group_teacher_assignments set ended_at=now(),ended_by=auth.uid() where tenant_id=p_tenant and group_id=p_group and ended_at is null
 and (not(employee_id=any(ids)) or is_primary is distinct from (employee_id=p_primary));
 insert into public.group_teacher_assignments(tenant_id,group_id,branch_id,employee_id,is_primary,assigned_by)
 select p_tenant,p_group,g.branch_id,e,e=p_primary,auth.uid() from unnest(ids) e where not exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.group_id=p_group and a.employee_id=e and a.ended_at is null);
 update public.study_groups set version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_group;
 perform private.lms_audit(p_tenant,p_group,null,'teachers_changed',before_value,private.lms_document(p_tenant,'group',p_group),trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,p_group);return p_group;
end $$;
create function private.enrollment_branch(t uuid,c uuid,b uuid,add_branch boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.customer_allowed(t,c,'customers.view') or not exists(select 1 from public.student_profiles s join public.customers x on x.tenant_id=s.tenant_id and x.id=s.customer_id where s.tenant_id=t and s.customer_id=c and x.archived_at is null) then raise exception using errcode='42501',message='Active student profile access required';end if;
 perform 1 from public.customers where tenant_id=t and id=c for update;
 if not exists(select 1 from public.customer_branches where tenant_id=t and customer_id=c and branch_id=b) then
 if add_branch is distinct from true or not private.customer_allowed(t,c,'customers.update') or not private.has_permission(t,'customers.update',b) or not private.has_permission(t,'customers.view',b) then raise exception using errcode='42501',message='Explicit authorized student branch addition required';end if;
 insert into public.customer_branches(tenant_id,customer_id,branch_id) values(t,c,b);
 perform private.customer_audit(t,c,'branches_changed',jsonb_build_object('added_branch_id',b));end if;
end $$;
create function private.insert_enrollment(t uuid,g uuid,c uuid,data jsonb,add_branch boolean,source uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare grp public.study_groups;price numeric;starts date;ends date;enrolled date;state text;result uuid;today date;
begin
 select * into grp from public.study_groups where tenant_id=t and id=g for update;
 if not found or not private.group_allowed(t,g) or not private.has_permission(t,'enrollments.view',grp.branch_id) or not private.has_permission(t,'enrollments.create',grp.branch_id) or not private.has_permission(t,'enrollments.view_pricing',grp.branch_id) then raise exception using errcode='42501',message='Enrollment creation denied';end if;
 if jsonb_typeof(data) is distinct from 'object' or jsonb_typeof(data->'agreed_price') is distinct from 'string' or coalesce(data->>'pricing_model','') not in ('fixed_course','monthly','per_lesson') or coalesce(data->>'currency','UZS')<>'UZS' or length(coalesce(data->>'notes',''))>3000 then raise exception 'Invalid enrollment agreement';end if;
 state:=coalesce(data->>'status','pending');starts:=private.lms_date(data->>'effective_start_date');ends:=private.lms_date(data->>'effective_end_date',true);enrolled:=private.lms_date(data->>'enrollment_date');price:=private.invoice_decimal(data->>'agreed_price');
 select (now() at time zone timezone)::date into today from public.tenants where id=t;
 if enrolled>today or grp.status not in ('planned','active') or state not in ('pending','active') or (state='active' and grp.status<>'active') then raise exception 'Choose a planned/active group and compatible enrollment status/date';end if;
 perform private.group_resources(t,grp.branch_id,grp.course_id,grp.classroom_id,grp.capacity);
 if not exists(select 1 from public.courses where tenant_id=t and id=grp.course_id and is_active) then raise exception 'Archived courses do not accept new enrollments';end if;
 if starts<grp.start_date or ends<starts or (grp.end_date is not null and coalesce(ends,starts)>grp.end_date) then raise exception 'Enrollment dates must fit the group period';end if;
 if exists(select 1 from public.student_enrollments where tenant_id=t and group_id=g and customer_id=c and status in ('pending','active','paused')) then raise exception using errcode='23505',message='Student already has an open enrollment in this group';end if;
 if (select count(*) from public.student_enrollments where tenant_id=t and group_id=g and status in ('pending','active','paused'))>=grp.capacity then raise exception 'Group is at capacity';end if;
 perform private.enrollment_branch(t,c,grp.branch_id,add_branch);
 insert into public.student_enrollments(tenant_id,group_id,branch_id,customer_id,enrollment_date,effective_start_date,effective_end_date,status,agreed_price,pricing_model,notes,transferred_from_id,created_by)
 values(t,g,grp.branch_id,c,enrolled,starts,ends,state,price,data->>'pricing_model',trim(coalesce(data->>'notes','')),source,auth.uid()) returning id into result;
 perform private.lms_audit(t,g,result,case when source is null then 'enrolled' else 'transferred_in' end,null,private.lms_document(t,'enrollment',result));return result;
end $$;
create function public.create_student_enrollment(p_tenant uuid,p_group uuid,p_student uuid,p_request uuid,p_data jsonb,p_add_branch boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb;replay uuid;result uuid;
begin
 payload:=jsonb_build_object('command','enroll','group',p_group,'student',p_student,'data',p_data,'add_branch',p_add_branch);replay:=private.lms_request(p_tenant,p_request,payload);
 if not private.group_allowed(p_tenant,p_group,'enrollments.create') then raise exception using errcode='42501',message='Enrollment creation denied';end if;
 if replay is not null then if not private.enrollment_allowed(p_tenant,replay,'enrollments.create') then raise exception using errcode='42501',message='Enrollment replay denied';end if;return replay;end if;
 result:=private.insert_enrollment(p_tenant,p_group,p_student,p_data,p_add_branch);perform private.lms_finish(p_tenant,p_request,payload,result);return result;
end $$;
create function public.update_student_enrollment(p_tenant uuid,p_enrollment uuid,p_request uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.student_enrollments;g public.study_groups;starts date;ends date;state text;reason text;today date;payload jsonb;replay uuid;before_value jsonb;
begin
 payload:=jsonb_build_object('command','enrollment_update','id',p_enrollment,'version',p_version,'data',p_data);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into e from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment for update;
 if not found or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.update') then raise exception using errcode='42501',message='Enrollment update denied';end if;
 state:=p_data->>'status';reason:=trim(coalesce(p_data->>'reason',''));
 if state in ('withdrawn','cancelled') and not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.withdraw') then raise exception using errcode='42501',message='Withdrawal denied';end if;
 if replay is not null then return replay;end if;
 if p_version is distinct from e.version then raise exception using errcode='40001',message='Enrollment changed; reload';end if;
 if e.status in ('completed','withdrawn','cancelled') then raise exception 'Terminal enrollment history cannot be edited';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or state is null or length(reason) not between 3 and 1000 or length(coalesce(p_data->>'notes',''))>3000 then raise exception 'Valid status, notes and a reason of 3 to 1000 characters are required';end if;
 if state<>e.status and not ((e.status='pending' and state in ('active','cancelled','withdrawn')) or (e.status='active' and state in ('paused','completed','withdrawn')) or (e.status='paused' and state in ('active','completed','withdrawn'))) then raise exception 'Unsupported enrollment status transition';end if;
 select * into g from public.study_groups where tenant_id=p_tenant and id=e.group_id;
 select (now() at time zone timezone)::date into today from public.tenants where id=p_tenant;
 starts:=private.lms_date(p_data->>'effective_start_date');ends:=private.lms_date(p_data->>'effective_end_date',true);
 if e.status<>'pending' and starts<>e.effective_start_date then raise exception 'An established enrollment start cannot change';end if;
 if starts<g.start_date or ends<starts or (g.end_date is not null and coalesce(ends,starts)>g.end_date) then raise exception 'Enrollment dates must fit the group period';end if;
 if state in ('completed','withdrawn') and (ends is null or ends>today) then raise exception 'A completed/withdrawn enrollment needs a nonfuture effective end date';end if;
 if state='active' and (g.status<>'active' or not exists(select 1 from public.branches where tenant_id=p_tenant and id=g.branch_id and is_active) or not exists(select 1 from public.customers where tenant_id=p_tenant and id=e.customer_id and archived_at is null)) then raise exception 'An active group, branch and nonarchived student are required to activate/resume';end if;
 before_value:=private.lms_document(p_tenant,'enrollment',p_enrollment);
 update public.student_enrollments set effective_start_date=starts,effective_end_date=ends,status=state,notes=trim(coalesce(p_data->>'notes','')),version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_enrollment;
 perform private.lms_audit(p_tenant,e.group_id,p_enrollment,'enrollment_updated',before_value,private.lms_document(p_tenant,'enrollment',p_enrollment),reason);perform private.lms_finish(p_tenant,p_request,payload,p_enrollment);return p_enrollment;
end $$;
create function public.transfer_student_enrollment(p_tenant uuid,p_enrollment uuid,p_target uuid,p_request uuid,p_version integer,p_date text,p_data jsonb,p_reason text,p_add_branch boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.student_enrollments;payload jsonb;replay uuid;result uuid;effective date;today date;before_value jsonb;
begin
 payload:=jsonb_build_object('command','transfer','id',p_enrollment,'target',p_target,'version',p_version,'date',p_date,'data',p_data,'reason',p_reason,'add_branch',p_add_branch);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into e from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment for update;
 if not found or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.transfer') or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.withdraw') or not private.group_allowed(p_tenant,p_target,'enrollments.transfer') then raise exception using errcode='42501',message='Transfer requires both authorized groups';end if;
 if replay is not null then if not private.enrollment_allowed(p_tenant,replay) then raise exception using errcode='42501',message='Transfer replay denied';end if;return replay;end if;
 if p_version is distinct from e.version then raise exception using errcode='40001',message='Enrollment changed; reload';end if;
 if p_target=e.group_id or e.status not in ('pending','active','paused') or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Choose a different group, open enrollment and transfer reason';end if;
 effective:=private.lms_date(p_date);select (now() at time zone timezone)::date into today from public.tenants where id=p_tenant;
 if effective<e.effective_start_date or effective>today or (e.effective_end_date is not null and effective>e.effective_end_date) then raise exception 'Transfer must be within the original period and not in the future';end if;
 before_value:=private.lms_document(p_tenant,'enrollment',e.id);
 update public.student_enrollments set status='withdrawn',effective_end_date=effective,version=version+1,updated_at=now() where tenant_id=p_tenant and id=e.id;
 result:=private.insert_enrollment(p_tenant,p_target,e.customer_id,p_data||jsonb_build_object('effective_start_date',effective::text,'enrollment_date',today::text),p_add_branch,e.id);
 perform private.lms_audit(p_tenant,e.group_id,e.id,'transferred_out',before_value,private.lms_document(p_tenant,'enrollment',e.id),trim(p_reason));perform private.lms_finish(p_tenant,p_request,payload,result);return result;
end $$;

create function private.group_capacity_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;g uuid;cap integer;
begin
 t:=new.tenant_id;if tg_table_name='study_groups' then g:=new.id;else g:=new.group_id;end if;
 perform 1 from public.tenants where id=t for update;select capacity into cap from public.study_groups where tenant_id=t and id=g;
 if (select count(*) from public.student_enrollments where tenant_id=t and group_id=g and status in ('pending','active','paused'))>cap then raise exception using errcode='23514',message='Group capacity exceeded';end if;return null;
end $$;
create constraint trigger group_capacity_integrity after insert or update on public.student_enrollments deferrable initially deferred for each row execute function private.group_capacity_integrity();
create constraint trigger group_capacity_integrity after insert or update on public.study_groups deferrable initially deferred for each row execute function private.group_capacity_integrity();
create function private.classroom_group_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.capacity<old.capacity and exists(select 1 from public.study_groups where tenant_id=new.tenant_id and classroom_id=new.id and status in ('planned','active','paused') and capacity>new.capacity) then raise exception 'Classroom capacity must cover current groups';end if;return new;
end $$;
create trigger classroom_group_capacity before update on public.classrooms for each row execute function private.classroom_group_capacity();
revoke all on function private.lms_date(text,boolean),private.lms_request(uuid,uuid,jsonb),private.lms_finish(uuid,uuid,jsonb,uuid),private.lms_document(uuid,text,uuid),private.lms_audit(uuid,uuid,uuid,text,jsonb,jsonb,text),private.group_resources(uuid,uuid,uuid,uuid,integer,uuid),private.enrollment_branch(uuid,uuid,uuid,boolean),private.insert_enrollment(uuid,uuid,uuid,jsonb,boolean,uuid),private.group_capacity_integrity(),private.classroom_group_capacity() from public,anon,authenticated;
revoke all on function public.save_study_group(uuid,uuid,uuid,integer,jsonb),public.change_group_status(uuid,uuid,uuid,integer,text,text),public.set_group_teachers(uuid,uuid,uuid,integer,uuid[],uuid,text),public.create_student_enrollment(uuid,uuid,uuid,uuid,jsonb,boolean),public.update_student_enrollment(uuid,uuid,uuid,integer,jsonb),public.transfer_student_enrollment(uuid,uuid,uuid,uuid,integer,text,jsonb,text,boolean) from public,anon;
grant execute on function public.save_study_group(uuid,uuid,uuid,integer,jsonb),public.change_group_status(uuid,uuid,uuid,integer,text,text),public.set_group_teachers(uuid,uuid,uuid,integer,uuid[],uuid,text),public.create_student_enrollment(uuid,uuid,uuid,uuid,jsonb,boolean),public.update_student_enrollment(uuid,uuid,uuid,integer,jsonb),public.transfer_student_enrollment(uuid,uuid,uuid,uuid,integer,text,jsonb,text,boolean) to authenticated;
