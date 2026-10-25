-- PostgreSQL text-to-date conversion is STABLE (DateStyle), not IMMUTABLE.
alter function private.lms_date(text,boolean) stable;
create function public.group_teacher_filters(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception using errcode='42501',message='Teacher filters denied';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by lower(full_name),id) from public.employees e where e.tenant_id=p_tenant and exists(select 1 from public.group_teacher_assignments a where a.tenant_id=p_tenant and a.employee_id=e.id and a.ended_at is null and private.group_allowed(p_tenant,a.group_id))),'[]');
end $$;
revoke all on function public.group_teacher_filters(uuid) from public,anon;
grant execute on function public.group_teacher_filters(uuid) to authenticated;
