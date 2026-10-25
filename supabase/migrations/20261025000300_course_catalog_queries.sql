create function public.academic_configuration_history(p_tenant uuid,p_kind text,p_id uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 0 and 100000 or p_kind is null or p_kind not in ('course','classroom','category','level') then raise exception 'Invalid academic history filters';end if;
 if (p_kind='classroom' and not private.classroom_allowed(p_tenant,p_id,'classrooms.manage')) or (p_kind<>'classroom' and not private.course_catalog_allowed(p_tenant,'courses.manage'))
 or private.academic_document(p_tenant,p_kind,p_id) is null then raise exception using errcode='42501',message='Academic history denied';end if;
 with rows as materialized(select e.id,e.operation,e.actor_name,e.reason,e.before_data,e.after_data,e.created_at from public.academic_configuration_events e
 where e.tenant_id=p_tenant and case p_kind when 'course' then e.course_id=p_id when 'classroom' then e.classroom_id=p_id when 'category' then e.category_id=p_id else e.level_id=p_id end),
 page as(select * from rows order by created_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
create function public.course_catalog_options(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.course_catalog_allowed(p_tenant) then raise exception using errcode='42501',message='Course catalog access denied';end if;
 return jsonb_build_object('categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active,'version',version) order by name,id) from public.course_categories where tenant_id=p_tenant),'[]'),
 'levels',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active,'version',version) order by name,id) from public.course_levels where tenant_id=p_tenant),'[]'));
end $$;
create function public.course_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;status text:=coalesce(p_filters->>'status','active');sorting text:=coalesce(p_filters->>'sort','name');category uuid;level uuid;
begin
 if not private.course_catalog_allowed(p_tenant) then raise exception using errcode='42501',message='Course catalog access denied';end if;
 if p_page is null or p_page not between 0 and 100000 or length(coalesce(p_filters->>'q',''))>100 or status not in ('active','inactive','all') or sorting not in ('name','newest','oldest','price_asc','price_desc')
 or coalesce(p_filters->>'pricing_model','') not in ('','fixed_course','monthly','per_lesson') then raise exception 'Invalid course filters';end if;
 category:=nullif(p_filters->>'category','')::uuid;level:=nullif(p_filters->>'level','')::uuid;
 with rows as materialized(
 select c.id,c.name,c.code,c.description,c.category_id,c.level_id,cat.name category_name,l.name level_name,c.duration_value,c.duration_unit,c.lesson_duration_minutes,c.standard_price,c.pricing_model,c.currency,c.is_active,c.version,c.created_at,c.updated_at
 from public.courses c left join public.course_categories cat on cat.tenant_id=c.tenant_id and cat.id=c.category_id left join public.course_levels l on l.tenant_id=c.tenant_id and l.id=c.level_id
 where c.tenant_id=p_tenant and (status='all' or c.is_active=(status='active')) and (category is null or c.category_id=category) and (level is null or c.level_id=level)
 and (coalesce(p_filters->>'pricing_model','')='' or c.pricing_model=p_filters->>'pricing_model') and position(lower(coalesce(p_filters->>'q','')) in lower(c.name||' '||coalesce(c.code,'')||' '||c.description))>0
 ), page as(select *,row_number() over(order by case when sorting='price_asc' then standard_price end,case when sorting='price_desc' then standard_price end desc,
 case when sorting='newest' then created_at end desc,case when sorting='oldest' then created_at end,lower(name),id) rank from rows order by rank limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg((to_jsonb(page)-'rank'-'standard_price')||jsonb_build_object('standard_price',round(standard_price,2)::text) order by rank) from page),'[]')) into result;return result;
end $$;
create function public.course_details(p_tenant uuid,p_course uuid,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;manage boolean;
begin
 if not private.course_catalog_allowed(p_tenant) then raise exception using errcode='42501',message='Course access denied';end if;
 doc:=private.academic_document(p_tenant,'course',p_course);if doc is null then raise exception using errcode='42501',message='Course access denied';end if;
 manage:=private.course_catalog_allowed(p_tenant,'courses.manage');
 return jsonb_build_object('course',doc,'can_manage',manage,'category_active',(select is_active from public.course_categories where tenant_id=p_tenant and id=(doc->>'category_id')::uuid),
 'level_active',(select is_active from public.course_levels where tenant_id=p_tenant and id=(doc->>'level_id')::uuid),
 'history',case when manage then public.academic_configuration_history(p_tenant,'course',p_course,p_history_page) else jsonb_build_object('total',0,'rows','[]'::jsonb) end);
end $$;
create function public.classroom_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare branch uuid;result jsonb;status text:=coalesce(p_filters->>'status','active');sorting text:=coalesce(p_filters->>'sort','name');
begin
 if not private.has_permission(p_tenant,'tenant.read') or (not private.has_permission(p_tenant,'classrooms.view') and not exists(select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'classrooms.view',id))) then raise exception using errcode='42501',message='Classroom access denied';end if;
 if p_page is null or p_page not between 0 and 100000 or status not in ('active','inactive','all') or sorting not in ('name','capacity_asc','capacity_desc','newest') or length(coalesce(p_filters->>'q',''))>100 then raise exception 'Invalid classroom filters';end if;
 branch:=nullif(p_filters->>'branch','')::uuid;
 if branch is not null and not private.has_permission(p_tenant,'classrooms.view',branch) then raise exception using errcode='42501',message='Classroom branch denied';end if;
 with rows as materialized(select c.id,c.branch_id,b.name branch_name,b.is_active branch_active,c.name,c.description,c.capacity,c.is_active,c.version,c.created_at,c.updated_at
 from public.classrooms c join public.branches b on b.tenant_id=c.tenant_id and b.id=c.branch_id where c.tenant_id=p_tenant and private.classroom_allowed(p_tenant,c.id)
 and (branch is null or c.branch_id=branch) and (status='all' or c.is_active=(status='active')) and position(lower(coalesce(p_filters->>'q','')) in lower(c.name||' '||c.description))>0),
 page as(select *,row_number() over(order by case when sorting='capacity_asc' then capacity end,case when sorting='capacity_desc' then capacity end desc,
 case when sorting='newest' then created_at end desc,lower(name),id) rank from rows order by rank limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)-'rank' order by rank) from page),'[]')) into result;return result;
end $$;
create function public.classroom_details(p_tenant uuid,p_classroom uuid,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;manage boolean;
begin
 if not private.classroom_allowed(p_tenant,p_classroom) then raise exception using errcode='42501',message='Classroom access denied';end if;
 doc:=private.academic_document(p_tenant,'classroom',p_classroom);manage:=private.classroom_allowed(p_tenant,p_classroom,'classrooms.manage');
 return jsonb_build_object('classroom',doc,'can_manage',manage,'branch_active',(select is_active from public.branches where tenant_id=p_tenant and id=(doc->>'branch_id')::uuid),
 'history',case when manage then public.academic_configuration_history(p_tenant,'classroom',p_classroom,p_history_page) else jsonb_build_object('total',0,'rows','[]'::jsonb) end);
end $$;
revoke all on function public.academic_configuration_history(uuid,text,uuid,integer),public.course_catalog_options(uuid),public.course_directory(uuid,jsonb,integer),public.course_details(uuid,uuid,integer),public.classroom_directory(uuid,jsonb,integer),public.classroom_details(uuid,uuid,integer) from public,anon;
grant execute on function public.academic_configuration_history(uuid,text,uuid,integer),public.course_catalog_options(uuid),public.course_directory(uuid,jsonb,integer),public.course_details(uuid,uuid,integer),public.classroom_directory(uuid,jsonb,integer),public.classroom_details(uuid,uuid,integer) to authenticated;
