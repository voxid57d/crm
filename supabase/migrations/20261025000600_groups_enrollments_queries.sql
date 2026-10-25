create function public.lms_options(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and (private.has_permission(p_tenant,'groups.view',id) or private.has_permission(p_tenant,'groups.view_assigned',id))) then raise exception using errcode='42501',message='Academic options denied';end if;
 return jsonb_build_object('courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active,'standard_price',round(standard_price,2)::text,'pricing_model',pricing_model,'currency',currency) order by lower(name),id) from public.courses where tenant_id=p_tenant and private.course_catalog_allowed(p_tenant)),'[]'),
 'classrooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'branch_id',branch_id,'name',name,'capacity',capacity,'is_active',is_active) order by lower(name),id) from public.classrooms where tenant_id=p_tenant and private.classroom_allowed(p_tenant,id)),'[]'));
end $$;
create function public.group_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;branch uuid;course uuid;teacher uuid;state text:=coalesce(p_filters->>'status','open');sorting text:=coalesce(p_filters->>'sort','name');
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and (private.has_permission(p_tenant,'groups.view',id) or private.has_permission(p_tenant,'groups.view_assigned',id))) then raise exception using errcode='42501',message='Group directory denied';end if;
 if p_page is null or p_page not between 0 and 100000 or length(coalesce(p_filters->>'q',''))>100 or state not in ('open','all','planned','active','paused','completed','cancelled','archived') or sorting not in ('name','newest','start','capacity') then raise exception 'Invalid group filters';end if;
 branch:=nullif(p_filters->>'branch','')::uuid;course:=nullif(p_filters->>'course','')::uuid;teacher:=nullif(p_filters->>'teacher','')::uuid;
 with rows as materialized(select g.id,g.branch_id,g.course_id,g.name,g.code,g.start_date,g.end_date,g.capacity,g.status,g.created_at,c.name course_name,b.name branch_name,
 (select count(*) from public.student_enrollments where tenant_id=p_tenant and group_id=g.id and status in ('pending','active','paused')) reserved_seats,
 (select count(*) from public.student_enrollments where tenant_id=p_tenant and group_id=g.id and status='active') active_enrollments,
 coalesce((select string_agg(e.full_name,', ' order by a.is_primary desc,e.full_name,a.id) from public.group_teacher_assignments a join public.employees e on e.tenant_id=p_tenant and e.id=a.employee_id where a.tenant_id=p_tenant and a.group_id=g.id and a.ended_at is null),'') teachers
 from public.study_groups g join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id join public.branches b on b.tenant_id=p_tenant and b.id=g.branch_id
 where g.tenant_id=p_tenant and private.group_allowed(p_tenant,g.id) and (branch is null or g.branch_id=branch) and (course is null or g.course_id=course)
 and (state='all' or state='open' and g.status in ('planned','active','paused') or g.status=state)
 and (teacher is null or exists(select 1 from public.group_teacher_assignments where tenant_id=p_tenant and group_id=g.id and employee_id=teacher and ended_at is null))
 and position(lower(coalesce(p_filters->>'q','')) in lower(g.name||' '||coalesce(g.code,'')))>0),
 page as(select *,row_number() over(order by case when sorting='newest' then created_at end desc,case when sorting='start' then start_date end,case when sorting='capacity' then capacity end,lower(name),id) rank from rows order by rank limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)-'rank' order by rank) from page),'[]')) into result;return result;
end $$;
create function public.lms_history(p_tenant uuid,p_group uuid,p_enrollment uuid default null,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 0 and 100000 or (p_enrollment is null and not private.group_allowed(p_tenant,p_group,'groups.update')) or
 (p_enrollment is not null and (not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.update') or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.view_pricing') or not exists(select 1 from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment and group_id=p_group))) then raise exception using errcode='42501',message='Academic history denied';end if;
 with rows as materialized(select id,operation,actor_name,reason,before_data,after_data,created_at from public.lms_events where tenant_id=p_tenant and group_id=p_group and enrollment_id is not distinct from p_enrollment),
 page as(select * from rows order by created_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
create function public.study_group_details(p_tenant uuid,p_group uuid,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;g public.study_groups;result jsonb;
begin
 if not private.group_allowed(p_tenant,p_group) then raise exception using errcode='42501',message='Group access denied';end if;
 select * into g from public.study_groups where tenant_id=p_tenant and id=p_group;doc:=private.lms_document(p_tenant,'group',p_group);
 select jsonb_build_object('reserved_seats',count(*) filter(where status in ('pending','active','paused')),'active_enrollments',count(*) filter(where status='active'),'unique_students',count(distinct customer_id) filter(where status='active'),'historical_enrollments',count(*)) into result from public.student_enrollments where tenant_id=p_tenant and group_id=p_group;
 return jsonb_build_object('group',doc,'counts',result,'course_active',(select is_active from public.courses where tenant_id=p_tenant and id=g.course_id),'classroom_active',(select is_active from public.classrooms where tenant_id=p_tenant and id=g.classroom_id),
 'can_update',private.group_allowed(p_tenant,p_group,'groups.update'),'can_archive',private.group_allowed(p_tenant,p_group,'groups.archive'),'can_assign',private.group_allowed(p_tenant,p_group,'groups.assign_teachers'),
 'can_enroll',private.group_allowed(p_tenant,p_group,'enrollments.create') and private.has_permission(p_tenant,'enrollments.view_pricing',g.branch_id),
 'can_roster',private.has_permission(p_tenant,'enrollments.view',g.branch_id),
 'teacher_history',case when private.group_allowed(p_tenant,p_group,'groups.assign_teachers') then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'name',e.full_name,'is_primary',a.is_primary,'assigned_at',a.assigned_at,'ended_at',a.ended_at,'eligible',private.employee_can_teach(p_tenant,a.employee_id,g.branch_id)) order by a.assigned_at desc,a.id) from public.group_teacher_assignments a join public.employees e on e.tenant_id=p_tenant and e.id=a.employee_id where a.tenant_id=p_tenant and a.group_id=p_group),'[]') else '[]'::jsonb end,
 'history',case when private.group_allowed(p_tenant,p_group,'groups.update') then public.lms_history(p_tenant,p_group,null,p_history_page) else jsonb_build_object('total',0,'rows','[]'::jsonb) end);
end $$;
create function public.enrollment_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;v_group uuid;v_customer uuid;v_branch uuid;state text:=coalesce(p_filters->>'status','all');sorting text:=coalesce(p_filters->>'sort','newest');
begin
 if not private.has_permission(p_tenant,'tenant.read') or not exists(select 1 from public.branches where tenant_id=p_tenant and private.has_permission(p_tenant,'enrollments.view',id)) then raise exception using errcode='42501',message='Enrollment directory denied';end if;
 if p_page is null or p_page not between 0 and 100000 or length(coalesce(p_filters->>'q',''))>100 or state not in ('all','open','pending','active','paused','completed','withdrawn','cancelled') or sorting not in ('newest','student','start') then raise exception 'Invalid enrollment filters';end if;
 v_group:=nullif(p_filters->>'group','')::uuid;v_customer:=nullif(p_filters->>'student','')::uuid;v_branch:=nullif(p_filters->>'branch','')::uuid;
 with rows as materialized(select e.id,e.group_id,e.branch_id,e.customer_id,e.status,e.enrollment_date,e.effective_start_date,e.effective_end_date,e.created_at,g.name group_name,course.name course_name,b.name branch_name,
 trim(c.first_name||' '||c.last_name) student_name,s.student_identifier,
 private.customer_allowed(p_tenant,e.customer_id,'customers.view') can_open_student,
 case when private.has_permission(p_tenant,'enrollments.view_pricing',e.branch_id) then round(e.agreed_price,2)::text end agreed_price,
 case when private.has_permission(p_tenant,'enrollments.view_pricing',e.branch_id) then e.pricing_model end pricing_model,
 e.currency
 from public.student_enrollments e join public.study_groups g on g.tenant_id=p_tenant and g.id=e.group_id join public.courses course on course.tenant_id=p_tenant and course.id=g.course_id join public.branches b on b.tenant_id=p_tenant and b.id=e.branch_id
 join public.customers c on c.tenant_id=p_tenant and c.id=e.customer_id join public.student_profiles s on s.tenant_id=p_tenant and s.customer_id=e.customer_id
 where e.tenant_id=p_tenant and private.enrollment_allowed(p_tenant,e.id) and (v_group is null or e.group_id=v_group) and (v_customer is null or e.customer_id=v_customer) and (v_branch is null or e.branch_id=v_branch)
 and (state='all' or state='open' and e.status in ('pending','active','paused') or e.status=state)
 and position(lower(coalesce(p_filters->>'q','')) in lower(c.first_name||' '||c.last_name||' '||s.student_identifier||' '||g.name))>0),
 page as(select *,row_number() over(order by case when sorting='newest' then created_at end desc,case when sorting='student' then lower(student_name) end,case when sorting='start' then effective_start_date end,id) rank from rows order by rank limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)-'rank' order by rank) from page),'[]')) into result;return result;
end $$;
create function public.student_enrollment_details(p_tenant uuid,p_enrollment uuid,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.student_enrollments;doc jsonb;pricing boolean;manage boolean;
begin
 if not private.enrollment_allowed(p_tenant,p_enrollment) then raise exception using errcode='42501',message='Enrollment access denied';end if;
 select * into e from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment;pricing:=private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.view_pricing');manage:=private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.update');
 doc:=private.lms_document(p_tenant,'enrollment',p_enrollment)-'agreed_price'-'pricing_model'-'notes';
 if pricing then doc:=doc||jsonb_build_object('agreed_price',round(e.agreed_price,2)::text,'pricing_model',e.pricing_model);end if;
 if manage then doc:=doc||jsonb_build_object('notes',e.notes);end if;
 return jsonb_build_object('enrollment',doc,'student',(select jsonb_build_object('name',trim(c.first_name||' '||c.last_name),'identifier',s.student_identifier,'can_open',private.customer_allowed(p_tenant,c.id,'customers.view')) from public.customers c join public.student_profiles s on s.tenant_id=p_tenant and s.customer_id=c.id where c.tenant_id=p_tenant and c.id=e.customer_id),
 'group',private.lms_document(p_tenant,'group',e.group_id),'can_update',manage,'can_withdraw',private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.withdraw'),
 'can_transfer',private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.transfer') and pricing,
 'transferred_to',(select id from public.student_enrollments d where d.tenant_id=p_tenant and d.transferred_from_id=e.id and private.enrollment_allowed(p_tenant,d.id)),
 'history',case when manage and pricing then public.lms_history(p_tenant,e.group_id,e.id,p_history_page) else jsonb_build_object('total',0,'rows','[]'::jsonb) end);
end $$;
create function public.group_student_choices(p_tenant uuid,p_group uuid,p_q text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;b uuid;
begin
 if not private.group_allowed(p_tenant,p_group,'enrollments.create') then raise exception using errcode='42501',message='Student selection denied';end if;
 if p_page is null or p_page not between 0 and 100000 or p_q is null or length(p_q)>100 then raise exception 'Invalid student search';end if;
 select branch_id into b from public.study_groups where tenant_id=p_tenant and id=p_group;
 with rows as materialized(select c.id,trim(c.first_name||' '||c.last_name) name,s.student_identifier,
 exists(select 1 from public.customer_branches where tenant_id=p_tenant and customer_id=c.id and branch_id=b) has_branch
 from public.customers c join public.student_profiles s on s.tenant_id=p_tenant and s.customer_id=c.id where c.tenant_id=p_tenant and c.archived_at is null and private.customer_allowed(p_tenant,c.id,'customers.view')
 and position(lower(p_q) in lower(c.first_name||' '||c.last_name||' '||s.student_identifier||' '||c.phone))>0
 and not exists(select 1 from public.student_enrollments e where e.tenant_id=p_tenant and e.group_id=p_group and e.customer_id=c.id and e.status in ('pending','active','paused'))),
 page as(select * from rows order by lower(name),id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by lower(name),id) from page),'[]')) into result;return result;
end $$;
create function public.group_teacher_choices(p_tenant uuid,p_group uuid,p_q text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;b uuid;
begin
 if not private.group_allowed(p_tenant,p_group,'groups.assign_teachers') then raise exception using errcode='42501',message='Teacher selection denied';end if;
 if p_page is null or p_page not between 0 and 100000 or p_q is null or length(p_q)>100 then raise exception 'Invalid teacher search';end if;
 select branch_id into b from public.study_groups where tenant_id=p_tenant and id=p_group;
 with rows as materialized(select id,full_name name from public.employees where tenant_id=p_tenant and private.employee_can_teach(p_tenant,id,b) and position(lower(p_q) in lower(full_name))>0),
 page as(select * from rows order by lower(name),id limit 20 offset p_page*20)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by lower(name),id) from page),'[]')) into result;return result;
end $$;
create function public.course_group_summary(p_tenant uuid,p_course uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.course_catalog_allowed(p_tenant) or not exists(select 1 from public.courses where tenant_id=p_tenant and id=p_course) then raise exception using errcode='42501',message='Course groups denied';end if;
 return (select jsonb_build_object('groups',count(*),'active_groups',count(*) filter(where g.status='active'),'active_enrollments',coalesce(sum((select count(*) from public.student_enrollments e where e.tenant_id=p_tenant and e.group_id=g.id and e.status='active')),0)) from public.study_groups g where tenant_id=p_tenant and course_id=p_course and private.group_allowed(p_tenant,g.id));
end $$;
revoke all on function public.lms_options(uuid),public.group_directory(uuid,jsonb,integer),public.lms_history(uuid,uuid,uuid,integer),public.study_group_details(uuid,uuid,integer),public.enrollment_directory(uuid,jsonb,integer),public.student_enrollment_details(uuid,uuid,integer),public.group_student_choices(uuid,uuid,text,integer),public.group_teacher_choices(uuid,uuid,text,integer),public.course_group_summary(uuid,uuid) from public,anon;
grant execute on function public.lms_options(uuid),public.group_directory(uuid,jsonb,integer),public.lms_history(uuid,uuid,uuid,integer),public.study_group_details(uuid,uuid,integer),public.enrollment_directory(uuid,jsonb,integer),public.student_enrollment_details(uuid,uuid,integer),public.group_student_choices(uuid,uuid,text,integer),public.group_teacher_choices(uuid,uuid,text,integer),public.course_group_summary(uuid,uuid) to authenticated;
