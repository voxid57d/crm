-- Student views reuse the original contact/profile identity and checked academic scopes.
create function private.student_lesson_member(t uuid,s uuid,l uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lessons lesson where lesson.tenant_id=t and lesson.id=l and (
  (lesson.roster_captured_at is not null and exists(select 1 from public.lesson_expected_students r where r.tenant_id=t and r.lesson_id=l and r.customer_id=s and private.enrollment_allowed(t,r.enrollment_id)))
  or (lesson.roster_captured_at is null and exists(select 1 from public.student_enrollments e where e.tenant_id=t and e.customer_id=s and e.group_id=lesson.group_id
   and e.status in ('active','completed','withdrawn') and e.effective_start_date<=(lesson.starts_at at time zone lesson.timezone)::date
   and (e.effective_end_date is null or e.effective_end_date>=(lesson.starts_at at time zone lesson.timezone)::date) and private.enrollment_allowed(t,e.id)))
 ));
$$;
revoke all on function private.student_lesson_member(uuid,uuid,uuid) from public,anon,authenticated;

create function public.student_lesson_directory(p_tenant uuid,p_student uuid,p_filters jsonb default '{}',p_page integer default 0,p_calendar boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare first_day date;last_day date;zone text;state text:=coalesce(nullif(p_filters->>'status',''),'all');result jsonb;size integer:=case when p_calendar then 200 else 20 end;
begin
 if not private.customer_allowed(p_tenant,p_student,'customers.view') or not exists(select 1 from public.student_profiles where tenant_id=p_tenant and customer_id=p_student) then raise exception using errcode='42501',message='Student access denied';end if;
 if p_page is null or p_page not between 0 and 100000 or p_calendar is null or state not in ('all','scheduled','in_progress','completed','cancelled','rescheduled') then raise exception 'Invalid student lesson filters';end if;
 select timezone into zone from public.tenants where id=p_tenant;
 first_day:=private.lms_date(p_filters->>'from');last_day:=private.lms_date(p_filters->>'to');
 if last_day<first_day or last_day-first_day>(case when p_calendar then 41 else 365 end) then raise exception 'Choose a bounded lesson date range';end if;
 with rows as materialized(select l.id,l.group_id,l.branch_id,g.course_id,l.starts_at,l.ends_at,l.timezone,l.teacher_id,l.substitute_id,l.effective_teacher_id,l.classroom_id,l.title,l.status,
  g.name group_name,c.name course_name,b.name branch_name,e.full_name teacher_name,sub.full_name substitute_name,r.name classroom_name
  from public.lessons l join public.study_groups g on g.tenant_id=p_tenant and g.id=l.group_id join public.courses c on c.tenant_id=p_tenant and c.id=g.course_id
  join public.branches b on b.tenant_id=p_tenant and b.id=l.branch_id join public.employees e on e.tenant_id=p_tenant and e.id=l.teacher_id
  left join public.employees sub on sub.tenant_id=p_tenant and sub.id=l.substitute_id left join public.classrooms r on r.tenant_id=p_tenant and r.id=l.classroom_id
  where l.tenant_id=p_tenant and private.lesson_allowed(p_tenant,l.id) and private.student_lesson_member(p_tenant,p_student,l.id)
  and l.starts_at<((last_day+1)::timestamp at time zone zone) and l.ends_at>(first_day::timestamp at time zone zone) and (state='all' or l.status=state)),
 page as(select * from rows order by starts_at,id limit size offset p_page*size)
 select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by starts_at,id) from page),'[]'),'page_size',size) into result;
 return result;
end $$;

create function public.student_academic_summary(p_tenant uuid,p_student uuid,p_page integer default 0,p_invoice_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;today date;
begin
 if not private.customer_allowed(p_tenant,p_student,'customers.view') or not exists(select 1 from public.student_profiles where tenant_id=p_tenant and customer_id=p_student) then raise exception using errcode='42501',message='Student access denied';end if;
 if p_page is null or p_page not between 0 and 100000 or p_invoice_page is null or p_invoice_page not between 0 and 100000 then raise exception 'Invalid student academic page';end if;
 select (now() at time zone timezone)::date into today from public.tenants where id=p_tenant;
 with enrollments as materialized(select e.*,g.course_id from public.student_enrollments e join public.study_groups g on g.tenant_id=p_tenant and g.id=e.group_id
  where e.tenant_id=p_tenant and e.customer_id=p_student and private.enrollment_allowed(p_tenant,e.id)),
 activity as materialized(
  select a.id,a.operation,a.created_at,a.group_id,a.enrollment_id,null::uuid lesson_id,g.name group_name from public.lms_events a
  join enrollments e on e.id=a.enrollment_id join public.study_groups g on g.tenant_id=p_tenant and g.id=a.group_id where a.tenant_id=p_tenant
  union all
  select a.id,a.operation,a.created_at,a.group_id,null::uuid,a.lesson_id,g.name from public.scheduling_events a
  join public.study_groups g on g.tenant_id=p_tenant and g.id=a.group_id where a.tenant_id=p_tenant and a.lesson_id is not null
  and private.lesson_allowed(p_tenant,a.lesson_id) and private.student_lesson_member(p_tenant,p_student,a.lesson_id)),
 activity_page as(select * from activity order by created_at desc,id desc limit 20 offset p_page*20),
 bills as materialized(select i.id,i.invoice_number,i.state,i.currency,i.issue_date,l.enrollment_id,g.name group_name,
  (select round(coalesce(sum(line_total),0)-i.discount_amount,2)::text from public.invoice_items where tenant_id=p_tenant and invoice_id=i.id) total,i.created_at
  from public.enrollment_invoice_links l join enrollments e on e.id=l.enrollment_id join public.invoices i on i.tenant_id=p_tenant and i.id=l.invoice_id
  join public.study_groups g on g.tenant_id=p_tenant and g.id=e.group_id where l.tenant_id=p_tenant and private.invoice_allowed(p_tenant,i.id)),
 bill_page as(select * from bills order by created_at desc,id limit 20 offset p_invoice_page*20)
 select jsonb_build_object(
  'active_courses',(select count(distinct course_id) from enrollments where status='active' and effective_start_date<=today and (effective_end_date is null or effective_end_date>=today)),
  'active_groups',(select count(distinct group_id) from enrollments where status='active' and effective_start_date<=today and (effective_end_date is null or effective_end_date>=today)),
  'historical_enrollments',(select count(*) from enrollments),
  'activity',jsonb_build_object('total',(select count(*) from activity),'rows',coalesce((select jsonb_agg(to_jsonb(activity_page) order by created_at desc,id desc) from activity_page),'[]')),
  'invoices',jsonb_build_object('total',(select count(*) from bills),'rows',coalesce((select jsonb_agg(to_jsonb(bill_page) order by created_at desc,id) from bill_page),'[]'))) into result;
 return result;
end $$;
create function public.student_enrollment_directory(p_tenant uuid,p_student uuid,p_page integer default 0,p_status text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.customer_allowed(p_tenant,p_student,'customers.view') or not exists(select 1 from public.student_profiles where tenant_id=p_tenant and customer_id=p_student) then raise exception using errcode='42501',message='Student access denied';end if;
 result:=public.enrollment_directory(p_tenant,jsonb_build_object('student',p_student,'status',p_status),p_page);
 return jsonb_set(result,'{rows}',coalesce((select jsonb_agg(row.value||jsonb_build_object('group_status',g.status,'teachers',
  coalesce((select string_agg(e.full_name,', ' order by a.is_primary desc,e.full_name,a.id) from public.group_teacher_assignments a join public.employees e on e.tenant_id=p_tenant and e.id=a.employee_id where a.tenant_id=p_tenant and a.group_id=g.id and a.ended_at is null),'')) order by row.ordinality)
  from jsonb_array_elements(result->'rows') with ordinality row(value,ordinality) join public.study_groups g on g.tenant_id=p_tenant and g.id=(row.value->>'group_id')::uuid),'[]'::jsonb));
end $$;
revoke all on function public.student_lesson_directory(uuid,uuid,jsonb,integer,boolean),public.student_academic_summary(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.student_lesson_directory(uuid,uuid,jsonb,integer,boolean),public.student_academic_summary(uuid,uuid,integer,integer) to authenticated;
revoke all on function public.student_enrollment_directory(uuid,uuid,integer,text) from public,anon;
grant execute on function public.student_enrollment_directory(uuid,uuid,integer,text) to authenticated;
