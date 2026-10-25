-- Recheck shared CRM scope after locking and require source agreement access on transfer.
create or replace function private.enrollment_branch(t uuid,c uuid,b uuid,add_branch boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.customers where tenant_id=t and id=c for update;
 if not private.customer_allowed(t,c,'customers.view') or not exists(select 1 from public.student_profiles s join public.customers x on x.tenant_id=s.tenant_id and x.id=s.customer_id where s.tenant_id=t and s.customer_id=c and x.archived_at is null) then raise exception using errcode='42501',message='Active student profile access required';end if;
 if not exists(select 1 from public.customer_branches where tenant_id=t and customer_id=c and branch_id=b) then
 if add_branch is distinct from true or not private.customer_allowed(t,c,'customers.update') or not private.has_permission(t,'customers.update',b) or not private.has_permission(t,'customers.view',b) then raise exception using errcode='42501',message='Explicit authorized student branch addition required';end if;
 insert into public.customer_branches(tenant_id,customer_id,branch_id) values(t,c,b);
 perform private.customer_audit(t,c,'branches_changed',jsonb_build_object('added_branch_id',b));end if;
end $$;
create or replace function public.transfer_student_enrollment(p_tenant uuid,p_enrollment uuid,p_target uuid,p_request uuid,p_version integer,p_date text,p_data jsonb,p_reason text,p_add_branch boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.student_enrollments;payload jsonb;replay uuid;result uuid;effective date;today date;before_value jsonb;
begin
 payload:=jsonb_build_object('command','transfer','id',p_enrollment,'target',p_target,'version',p_version,'date',p_date,'data',p_data,'reason',p_reason,'add_branch',p_add_branch);replay:=private.lms_request(p_tenant,p_request,payload);
 select * into e from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment for update;
 if not found or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.transfer') or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.withdraw') or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.view_pricing') or not private.group_allowed(p_tenant,p_target,'enrollments.transfer') then raise exception using errcode='42501',message='Transfer requires both authorized groups';end if;
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
