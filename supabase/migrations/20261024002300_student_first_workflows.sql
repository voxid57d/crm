-- 6F: preserve all identities, sales and money. These narrow workflows wrap
-- existing customer save/conversion transactions; no existing rows are rewritten.
create table public.student_save_requests (
 tenant_id uuid not null,request_id uuid not null,actor_id uuid not null references auth.users(id),customer_id uuid not null,
 request_payload jsonb not null,created_at timestamptz not null default now(),primary key(tenant_id,request_id),
 foreign key(tenant_id,customer_id) references public.student_profiles(tenant_id,customer_id)
);
alter table public.student_save_requests enable row level security;
revoke all on public.student_save_requests from public,anon,authenticated;
create policy student_requests_read on public.student_save_requests for select to authenticated using(actor_id=auth.uid() and private.customer_allowed(tenant_id,customer_id,'customers.view'));
create trigger student_requests_immutable before update or delete on public.student_save_requests for each row execute function private.finance_immutable();

create function public.save_student(p_tenant uuid,p_request uuid,p_customer uuid,p_profile jsonb,p_student jsonb,p_branches uuid[],p_tags uuid[] default '{}',p_fields jsonb default '{}',p_confirm_duplicate boolean default false,p_mode text default 'create') returns uuid
language plpgsql security definer set search_path='' as $$
declare receipt public.student_save_requests;payload jsonb;student jsonb;result uuid;existing public.student_profiles;
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception using errcode='42501',message='Student save denied';end if;
 if p_request is null or p_mode is null or p_mode not in ('create','edit') or jsonb_typeof(p_student) is distinct from 'object' or jsonb_typeof(p_profile) is distinct from 'object' then raise exception 'Invalid student request';end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if p_customer is null then
  if p_mode<>'create' or not private.branches_allowed(p_tenant,p_branches,'customers.create') or not private.branches_allowed(p_tenant,p_branches,'customers.view') then raise exception using errcode='42501',message='Student creation denied';end if;
 else
  if not private.customer_allowed(p_tenant,p_customer,'customers.view') or not private.customer_allowed(p_tenant,p_customer,'customers.update') then raise exception using errcode='42501',message='Student update denied';end if;
 end if;
 payload:=jsonb_build_object('customer',p_customer,'profile',p_profile,'student',p_student,'branches',p_branches,'tags',p_tags,'fields',p_fields,'separate',p_confirm_duplicate,'mode',p_mode);
 select * into receipt from public.student_save_requests where tenant_id=p_tenant and request_id=p_request;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.request_payload<>payload then raise exception 'Student request identifier already used for different details';end if;
  if not private.customer_allowed(p_tenant,receipt.customer_id,'customers.view') then raise exception using errcode='42501',message='Student access changed';end if;return receipt.customer_id;
 end if;
 if p_customer is null and p_confirm_duplicate is distinct from true and exists(select 1 from public.customer_duplicate_candidates(p_tenant,coalesce(p_profile->>'phone',''),coalesce(p_profile->>'email',''),trim(coalesce(p_profile->>'first_name','')||' '||coalesce(p_profile->>'last_name',''))))
 then raise exception 'Possible existing contacts or students: reuse a match or confirm a separate person';end if;
 select * into existing from public.student_profiles where tenant_id=p_tenant and customer_id=p_customer;
 if p_mode='edit' and existing.customer_id is null then raise exception 'Student profile required for editing';end if;
 -- Concurrent promotion must reuse the student that won the race, preserving it.
 if p_mode='create' and existing.customer_id is not null then result:=p_customer;
 else
  student:=p_student||jsonb_build_object('student_identifier',coalesce(nullif(trim(p_student->>'student_identifier'),''),existing.student_identifier,'ST-'||gen_random_uuid()::text),
   'education_status',coalesce(nullif(p_student->>'education_status',''),'active'));
  result:=public.save_customer(p_tenant,p_customer,p_profile,p_branches,p_tags,student,p_fields);
 end if;
 insert into public.student_save_requests(tenant_id,request_id,actor_id,customer_id,request_payload) values(p_tenant,p_request,auth.uid(),result,payload);return result;
end $$;

create function public.convert_lead_to_student(p_tenant uuid,p_lead uuid,p_customer uuid default null,p_stage uuid default null,p_confirm_duplicate boolean default false,p_student jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare lead public.leads;contact public.customers;result uuid;created boolean;profile jsonb;
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception using errcode='42501',message='Student conversion denied';end if;
 perform 1 from public.tenants where id=p_tenant for update;
 select * into lead from public.leads where tenant_id=p_tenant and id=p_lead for update;
 if not found or lead.archived_at is not null or not private.lead_allowed(p_tenant,p_lead,'leads.view') or not private.lead_allowed(p_tenant,p_lead,'leads.convert') then raise exception using errcode='42501',message='Student conversion denied';end if;
 if jsonb_typeof(p_student) is distinct from 'object' then raise exception 'Invalid student profile';end if;
 if lead.status='converted' and p_customer is not null and p_customer is distinct from lead.customer_id then raise exception 'Converted lead already has a different identity';end if;
 created:=lead.status<>'converted' and p_customer is null;
 result:=public.convert_lead(p_tenant,p_lead,p_customer,p_stage,p_confirm_duplicate);
 select * into contact from public.customers where tenant_id=p_tenant and id=result;
 if not found or contact.archived_at is not null or not private.customer_allowed(p_tenant,result,'customers.view') then raise exception using errcode='42501',message='Converted contact is unavailable';end if;
 if not exists(select 1 from public.student_profiles where tenant_id=p_tenant and customer_id=result) then
  if not created and not private.customer_allowed(p_tenant,result,'customers.update') then raise exception using errcode='42501',message='Adding a student profile requires contact update access';end if;
  insert into public.student_profiles(tenant_id,customer_id,student_identifier,education_status,school,education_level,learning_goals,additional_information,enrollment_date)
  values(p_tenant,result,coalesce(nullif(trim(p_student->>'student_identifier'),''),'ST-'||gen_random_uuid()::text),coalesce(nullif(p_student->>'education_status',''),'prospective'),
   nullif(trim(p_student->>'school'),''),nullif(trim(p_student->>'education_level'),''),nullif(trim(p_student->>'learning_goals'),''),nullif(trim(p_student->>'additional_information'),''),nullif(p_student->>'enrollment_date','')::date);
  select to_jsonb(s) into profile from public.student_profiles s where tenant_id=p_tenant and customer_id=result;
  perform private.customer_audit(p_tenant,result,'student_updated',jsonb_build_object('before',null,'after',profile,'lead_id',p_lead));
 end if;return result;
end $$;
revoke all on function public.save_student(uuid,uuid,uuid,jsonb,jsonb,uuid[],uuid[],jsonb,boolean,text),public.convert_lead_to_student(uuid,uuid,uuid,uuid,boolean,jsonb) from public,anon;
grant execute on function public.save_student(uuid,uuid,uuid,jsonb,jsonb,uuid[],uuid[],jsonb,boolean,text),public.convert_lead_to_student(uuid,uuid,uuid,uuid,boolean,jsonb) to authenticated;
