-- Keep unlinked contacts reusable for authorized business-wide users, while
-- branch users still need an authorized linked student to discover a guardian.
create or replace function private.guardian_allowed(t uuid,g uuid,p text,all_students boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.guardians where tenant_id=t and id=g) and
 (private.has_permission(t,p) or (
 exists(select 1 from public.student_guardians where tenant_id=t and guardian_id=g and private.customer_allowed(t,customer_id,p))
 and (not all_students or not exists(select 1 from public.student_guardians where tenant_id=t and guardian_id=g and not private.customer_allowed(t,customer_id,p)))));
$$;
