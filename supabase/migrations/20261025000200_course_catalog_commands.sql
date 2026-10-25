create function private.academic_integer(value text,minimum integer,maximum integer,optional boolean default false) returns integer language plpgsql immutable set search_path='' as $$
declare n integer;
begin
 if nullif(trim(value),'') is null and optional then return null;end if;
 if value is null or value!~'^[0-9]{1,5}$' then raise exception 'Enter a whole number in the supported range';end if;
 n:=value::integer;if n<minimum or n>maximum then raise exception 'Whole number is outside the supported range';end if;return n;
end $$;
create function private.academic_document(t uuid,kind text,identifier uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if kind='course' then
  select (to_jsonb(c)-'standard_price')||jsonb_build_object('standard_price',round(c.standard_price,2)::text,'category_name',category.name,'level_name',level.name)
  into result from public.courses c left join public.course_categories category on category.tenant_id=t and category.id=c.category_id
  left join public.course_levels level on level.tenant_id=t and level.id=c.level_id where c.tenant_id=t and c.id=identifier;
 elsif kind='classroom' then select to_jsonb(c)||jsonb_build_object('branch_name',b.name) into result from public.classrooms c join public.branches b on b.tenant_id=t and b.id=c.branch_id where c.tenant_id=t and c.id=identifier;
 elsif kind='category' then select to_jsonb(c) into result from public.course_categories c where tenant_id=t and id=identifier;
 elsif kind='level' then select to_jsonb(c) into result from public.course_levels c where tenant_id=t and id=identifier;
 else raise exception 'Unknown academic resource';end if;return result;
end $$;
create function private.academic_request(t uuid,request uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare event public.academic_configuration_events;
begin
 if request is null or auth.uid() is null or not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Academic request denied';end if;
 perform 1 from public.tenants where id=t for update;
 select * into event from public.academic_configuration_events where tenant_id=t and request_id=request;
 if found then
  if event.actor_id<>auth.uid() or event.request_payload<>payload then raise exception 'Academic request identifier already used for different details';end if;
  return coalesce(event.course_id,event.classroom_id,event.category_id,event.level_id);
 end if;return null;
end $$;
create function private.academic_audit(t uuid,kind text,identifier uuid,request uuid,payload jsonb,operation text,before_value jsonb,after_value jsonb,reason text default '') returns void language sql security definer set search_path='' as $$
 insert into public.academic_configuration_events(tenant_id,course_id,classroom_id,category_id,level_id,branch_id,request_id,request_payload,operation,actor_id,actor_name,before_data,after_data,reason)
 values(t,case when kind='course' then identifier end,case when kind='classroom' then identifier end,case when kind='category' then identifier end,case when kind='level' then identifier end,
 case when kind='classroom' then (after_value->>'branch_id')::uuid end,request,payload,operation,auth.uid(),coalesce((select nullif(trim(full_name),'') from public.profiles where id=auth.uid()),'Business member'),before_value,after_value,reason);
$$;
create function public.save_course(p_tenant uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.courses;data jsonb;payload jsonb;replay uuid;price numeric;category uuid;level uuid;active_input boolean;before_value jsonb;result uuid;
begin
 if not private.course_catalog_allowed(p_tenant,'courses.manage') then raise exception using errcode='42501',message='Business-wide course management denied';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'standard_price') is distinct from 'string'
 or length(trim(coalesce(p_data->>'name',''))) not between 1 and 150 or length(coalesce(p_data->>'code',''))>40 or length(coalesce(p_data->>'description',''))>6000
 or coalesce(p_data->>'pricing_model','') not in ('fixed_course','monthly','per_lesson') or coalesce(p_data->>'currency','UZS')<>'UZS'
 or coalesce(p_data->>'duration_unit','weeks') not in ('days','weeks','months','lessons') then raise exception 'Invalid course details or decimal price';end if;
 if p_data?'is_active' then if jsonb_typeof(p_data->'is_active') is distinct from 'boolean' then raise exception 'Choose an active status';end if;active_input:=(p_data->>'is_active')::boolean;end if;
 price:=private.invoice_decimal(p_data->>'standard_price');category:=nullif(p_data->>'category_id','')::uuid;level:=nullif(p_data->>'level_id','')::uuid;
 data:=jsonb_build_object('name',trim(p_data->>'name'),'code',nullif(trim(p_data->>'code'),''),'description',trim(coalesce(p_data->>'description','')),'category_id',category,'level_id',level,
 'duration_value',private.academic_integer(p_data->>'duration_value',1,10000,true),'duration_unit',coalesce(p_data->>'duration_unit','weeks'),
 'lesson_duration_minutes',private.academic_integer(p_data->>'lesson_duration_minutes',1,1440,true),'standard_price',price::text,'pricing_model',p_data->>'pricing_model','currency','UZS','is_active',active_input);
 payload:=jsonb_build_object('kind','course','command','save','id',p_id,'version',p_version,'data',data);replay:=private.academic_request(p_tenant,p_request,payload);
 if not private.course_catalog_allowed(p_tenant,'courses.manage') then raise exception using errcode='42501',message='Course access changed';end if;
 if replay is not null then return replay;end if;
 if p_id is not null then
  select * into c from public.courses where tenant_id=p_tenant and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Course unavailable';end if;
  if p_version is distinct from c.version then raise exception using errcode='40001',message='Course changed; reload before saving';end if;
  if active_input is not null and active_input<>c.is_active then raise exception 'Use the course activate/deactivate action';end if;
  before_value:=private.academic_document(p_tenant,'course',p_id);
 elsif p_version is distinct from 0 then raise exception 'New course version must be zero';end if;
 if category is not null and not exists(select 1 from public.course_categories where tenant_id=p_tenant and id=category and (is_active or id=c.category_id)) then raise exception 'Choose an active course category in this business';end if;
 if level is not null and not exists(select 1 from public.course_levels where tenant_id=p_tenant and id=level and (is_active or id=c.level_id)) then raise exception 'Choose an active course level in this business';end if;
 if p_id is null then
  insert into public.courses(tenant_id,name,code,description,category_id,level_id,duration_value,duration_unit,lesson_duration_minutes,standard_price,pricing_model,is_active,created_by)
  values(p_tenant,data->>'name',data->>'code',data->>'description',category,level,(data->>'duration_value')::integer,data->>'duration_unit',(data->>'lesson_duration_minutes')::integer,price,data->>'pricing_model',coalesce(active_input,true),auth.uid()) returning id into result;
 else
  update public.courses set name=data->>'name',code=data->>'code',description=data->>'description',category_id=category,level_id=level,duration_value=(data->>'duration_value')::integer,
  duration_unit=data->>'duration_unit',lesson_duration_minutes=(data->>'lesson_duration_minutes')::integer,standard_price=price,pricing_model=data->>'pricing_model',version=version+1,updated_at=now()
  where tenant_id=p_tenant and id=p_id returning id into result;
 end if;
 perform private.academic_audit(p_tenant,'course',result,p_request,payload,case when p_id is null then 'created' else 'updated' end,before_value,private.academic_document(p_tenant,'course',result));return result;
end $$;
create function public.save_course_setting(p_tenant uuid,p_kind text,p_id uuid,p_request uuid,p_version integer,p_name text,p_active boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare before_value jsonb;result uuid;payload jsonb;replay uuid;current_version integer;operation text;
begin
 if not private.course_catalog_allowed(p_tenant,'courses.manage') then raise exception using errcode='42501',message='Course settings management denied';end if;
 if p_kind is null or p_kind not in ('category','level') or p_name is null or length(trim(p_name)) not between 1 and 100 or p_active is null then raise exception 'Invalid course setting';end if;
 payload:=jsonb_build_object('kind',p_kind,'command','save','id',p_id,'version',p_version,'name',trim(p_name),'active',p_active);replay:=private.academic_request(p_tenant,p_request,payload);
 if not private.course_catalog_allowed(p_tenant,'courses.manage') then raise exception using errcode='42501',message='Course settings access changed';end if;
 if replay is not null then return replay;end if;
 if p_id is not null then
  if p_kind='category' then select version into current_version from public.course_categories where tenant_id=p_tenant and id=p_id for update;
  else select version into current_version from public.course_levels where tenant_id=p_tenant and id=p_id for update;end if;
  if current_version is null then raise exception using errcode='42501',message='Course setting unavailable';end if;
  if current_version is distinct from p_version then raise exception using errcode='40001',message='Course setting changed; reload';end if;
  before_value:=private.academic_document(p_tenant,p_kind,p_id);
 elsif p_version is distinct from 0 then raise exception 'New setting version must be zero';end if;
 if p_kind='category' then
  if p_id is null then insert into public.course_categories(tenant_id,name,is_active,created_by) values(p_tenant,trim(p_name),p_active,auth.uid()) returning id into result;
  else update public.course_categories set name=trim(p_name),is_active=p_active,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id returning id into result;end if;
 else
  if p_id is null then insert into public.course_levels(tenant_id,name,is_active,created_by) values(p_tenant,trim(p_name),p_active,auth.uid()) returning id into result;
  else update public.course_levels set name=trim(p_name),is_active=p_active,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id returning id into result;end if;
 end if;
 operation:=case when p_id is null then 'created' when (before_value->>'is_active')::boolean is distinct from p_active then case when p_active then 'reactivated' else 'deactivated' end else 'updated' end;
 perform private.academic_audit(p_tenant,p_kind,result,p_request,payload,operation,before_value,private.academic_document(p_tenant,p_kind,result));return result;
end $$;
create function public.save_classroom(p_tenant uuid,p_id uuid,p_request uuid,p_version integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.classrooms;data jsonb;payload jsonb;replay uuid;branch uuid;before_value jsonb;result uuid;
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception using errcode='42501',message='Classroom management denied';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or length(trim(coalesce(p_data->>'name',''))) not between 1 and 100 or length(coalesce(p_data->>'description',''))>2000 then raise exception 'Invalid classroom details';end if;
 branch:=(p_data->>'branch_id')::uuid;
 data:=jsonb_build_object('branch_id',branch,'name',trim(p_data->>'name'),'description',trim(coalesce(p_data->>'description','')),'capacity',private.academic_integer(p_data->>'capacity',1,10000));
 payload:=jsonb_build_object('kind','classroom','command','save','id',p_id,'version',p_version,'data',data);replay:=private.academic_request(p_tenant,p_request,payload);
 if p_id is not null then
  select * into c from public.classrooms where tenant_id=p_tenant and id=p_id for update;
  if not found or not private.classroom_allowed(p_tenant,p_id,'classrooms.manage') then raise exception using errcode='42501',message='Classroom management denied';end if;
  if branch is distinct from c.branch_id then raise exception 'Classroom branch cannot change';end if;
 else
  if not private.has_permission(p_tenant,'classrooms.view',branch) or not private.has_permission(p_tenant,'classrooms.manage',branch) then raise exception using errcode='42501',message='Classroom management denied';end if;
 end if;
 if replay is not null then return replay;end if;
 if p_id is null then
  if p_version is distinct from 0 then raise exception 'New classroom version must be zero';end if;
  if not exists(select 1 from public.branches where tenant_id=p_tenant and id=branch and is_active) then raise exception 'Choose an active branch';end if;
  insert into public.classrooms(tenant_id,branch_id,name,description,capacity,created_by) values(p_tenant,branch,data->>'name',data->>'description',(data->>'capacity')::integer,auth.uid()) returning id into result;
 else
  if p_version is distinct from c.version then raise exception using errcode='40001',message='Classroom changed; reload before saving';end if;
  before_value:=private.academic_document(p_tenant,'classroom',p_id);
  update public.classrooms set name=data->>'name',description=data->>'description',capacity=(data->>'capacity')::integer,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id returning id into result;
 end if;
 perform private.academic_audit(p_tenant,'classroom',result,p_request,payload,case when p_id is null then 'created' else 'updated' end,before_value,private.academic_document(p_tenant,'classroom',result));return result;
end $$;
create function public.set_academic_active(p_tenant uuid,p_kind text,p_id uuid,p_request uuid,p_version integer,p_active boolean,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb;replay uuid;before_value jsonb;current_version integer;
begin
 if p_kind is null or p_kind not in ('course','classroom','category','level') or p_active is null or p_reason is null or length(p_reason)>1000 then raise exception 'Invalid resource status';end if;
 payload:=jsonb_build_object('kind',p_kind,'command','status','id',p_id,'version',p_version,'active',p_active,'reason',trim(p_reason));replay:=private.academic_request(p_tenant,p_request,payload);
 if p_kind='classroom' then
  if not private.classroom_allowed(p_tenant,p_id,'classrooms.manage') then raise exception using errcode='42501',message='Classroom status change denied';end if;
 else
  if not private.course_catalog_allowed(p_tenant,'courses.manage') then raise exception using errcode='42501',message='Business-wide course management denied';end if;
 end if;
 if replay is not null then return replay;end if;
 before_value:=private.academic_document(p_tenant,p_kind,p_id);current_version:=(before_value->>'version')::integer;
 if current_version is null then raise exception using errcode='42501',message='Academic resource unavailable';end if;
 if current_version is distinct from p_version then raise exception using errcode='40001',message='Academic resource changed; reload';end if;
 if p_kind='classroom' then
  if p_active and not exists(select 1 from public.branches where tenant_id=p_tenant and id=(before_value->>'branch_id')::uuid and is_active) then raise exception 'Reactivate the branch before its classroom';end if;
  update public.classrooms set is_active=p_active,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id;
 elsif p_kind='course' then update public.courses set is_active=p_active,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id;
 elsif p_kind='category' then update public.course_categories set is_active=p_active,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id;
 else update public.course_levels set is_active=p_active,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id;end if;
 perform private.academic_audit(p_tenant,p_kind,p_id,p_request,payload,case when p_active then 'reactivated' else 'deactivated' end,before_value,private.academic_document(p_tenant,p_kind,p_id),trim(p_reason));return p_id;
end $$;
revoke all on function private.academic_integer(text,integer,integer,boolean),private.academic_document(uuid,text,uuid),private.academic_request(uuid,uuid,jsonb),private.academic_audit(uuid,text,uuid,uuid,jsonb,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.save_course(uuid,uuid,uuid,integer,jsonb),public.save_course_setting(uuid,text,uuid,uuid,integer,text,boolean),public.save_classroom(uuid,uuid,uuid,integer,jsonb),public.set_academic_active(uuid,text,uuid,uuid,integer,boolean,text) from public,anon;
grant execute on function public.save_course(uuid,uuid,uuid,integer,jsonb),public.save_course_setting(uuid,text,uuid,uuid,integer,text,boolean),public.save_classroom(uuid,uuid,uuid,integer,jsonb),public.set_academic_active(uuid,text,uuid,uuid,integer,boolean,text) to authenticated;
