create function private.is_business_owner(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tenants where id=t and owner_id=auth.uid()) and private.member_enabled(t,auth.uid());
$$;
create function private.check_branch_array(t uuid, ids uuid[]) returns void language plpgsql set search_path='' as $$
begin
 if exists(select 1 from unnest(ids) x where x is null or not exists(select 1 from public.branches b where b.tenant_id=t and b.id=x)) then
 raise exception 'Branch does not belong to this business' using errcode='42501'; end if;
end $$;
create function private.branches_allowed(t uuid, ids uuid[], p text) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_permission(t,p) or (coalesce(cardinality(ids),0)>0 and not exists(select 1 from unnest(ids) x where not private.has_permission(t,p,x)));
$$;
create function private.check_delegation(t uuid,r uuid,b uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.business_roles where tenant_id=t and id=r and system_key is distinct from 'owner') then
 raise exception 'Owner role cannot be assigned' using errcode='42501'; end if;
 if exists(select 1 from public.business_role_permissions where tenant_id=t and role_id=r and not private.has_permission(t,permission,b)) then
 raise exception 'Cannot delegate permissions you do not hold' using errcode='42501'; end if;
end $$;
create function private.apply_member_access(t uuid,u uuid,r uuid,ids uuid[], overrides jsonb,a boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.tenants where id=t and owner_id=u) then raise exception 'Owner cannot be reassigned or suspended' using errcode='42501'; end if;
 perform private.check_branch_array(t,ids);
 if not exists(select 1 from public.business_roles where tenant_id=t and id=r and system_key is distinct from 'owner') then raise exception 'Invalid role' using errcode='42501'; end if;
 if a and (select scope from public.business_roles where id=r)='branch' and coalesce(cardinality(ids),0)=0 then raise exception 'Assign at least one branch' using errcode='22023'; end if;
 if a and exists(select 1 from public.employees where tenant_id=t and user_id=u and status<>'active') then raise exception 'Reactivate employee before restoring access' using errcode='42501'; end if;
 if jsonb_typeof(overrides)<>'object' or exists(select 1 from jsonb_each_text(overrides) v where not(v.key::uuid=any(ids)) or
 not exists(select 1 from public.business_roles where tenant_id=t and id=v.value::uuid and scope='branch')) then raise exception 'Invalid branch role' using errcode='42501'; end if;
 insert into public.tenant_memberships(tenant_id,user_id,role_id,is_active) values(t,u,r,a)
 on conflict(tenant_id,user_id) do update set role_id=excluded.role_id,is_active=excluded.is_active;
 delete from public.branch_memberships where tenant_id=t and user_id=u and not(branch_id=any(ids));
 insert into public.branch_memberships(tenant_id,user_id,branch_id,role_id)
 select t,u,x,(overrides->>x::text)::uuid from (select distinct unnest(ids) x) s
 on conflict(tenant_id,branch_id,user_id) do update set role_id=excluded.role_id;
end $$;
create function public.assign_member_role(p_tenant uuid,p_user uuid,p_role uuid,p_branches uuid[],p_branch_roles jsonb default '{}',p_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare e public.employees; v record;
begin
 if not private.has_permission(p_tenant,'roles.manage') then raise exception 'Role management denied' using errcode='42501'; end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if p_active is null then raise exception 'Choose membership status'; end if;
 if not exists(select 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_user) and not private.is_business_owner(p_tenant) then raise exception 'Only Owner can enroll accounts' using errcode='42501'; end if;
 perform private.check_delegation(p_tenant,p_role);
 for v in select key,value from jsonb_each_text(p_branch_roles) loop perform private.check_delegation(p_tenant,v.value::uuid,v.key::uuid); end loop;
 select * into e from public.employees where tenant_id=p_tenant and user_id=p_user for update;
 if e.id is not null and p_active and (not private.employee_allowed(p_tenant,e.id,'employees.update') or not private.branches_allowed(p_tenant,p_branches,'employees.update')) then
 raise exception 'Employee assignment access denied' using errcode='42501'; end if;
 perform private.apply_member_access(p_tenant,p_user,p_role,coalesce(p_branches,'{}'),coalesce(p_branch_roles,'{}'),p_active);
 if e.id is not null and p_active then
 delete from public.employee_branches where tenant_id=p_tenant and employee_id=e.id and not(branch_id=any(p_branches));
 insert into public.employee_branches select p_tenant,e.id,x from (select distinct unnest(p_branches) x) s on conflict do nothing;
 update public.employees set updated_at=now() where tenant_id=p_tenant and id=e.id;
 end if;
end $$;
-- Preserve the existing entry point; delegate to the same role engine.
create or replace function public.set_business_member(p_tenant uuid,p_email text,p_role public.app_role,p_branches uuid[] default '{}',p_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid;r uuid;
begin
 if not private.is_business_owner(p_tenant) then raise exception 'Owner permission required' using errcode='42501'; end if;
 if p_role not in ('admin','manager','employee') then raise exception 'Choose Admin, Branch Manager, or Employee' using errcode='22023'; end if;
 select id into u from auth.users where lower(email)=lower(trim(p_email));
 if u is null then raise exception 'Account must register first' using errcode='22023'; end if;
 select id into r from public.business_roles where tenant_id=p_tenant and system_key=p_role::text;
 perform public.assign_member_role(p_tenant,u,r,p_branches,'{}',p_active);
end $$;
create function public.save_business_role(p_tenant uuid,p_id uuid,p_name text,p_scope text,p_permissions text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid:=coalesce(p_id,gen_random_uuid());
begin
 if not private.has_permission(p_tenant,'roles.manage') then raise exception 'Role management denied' using errcode='42501'; end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if p_scope not in ('business','branch') or p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Invalid role settings'; end if;
 if p_id is not null and not exists(select 1 from public.business_roles where id=p_id and tenant_id=p_tenant and system_key is null) then raise exception 'System roles are immutable' using errcode='42501'; end if;
 if exists(select 1 from unnest(p_permissions) k where not exists(select 1 from public.permissions where key=k and assignable)
 or not private.has_permission(p_tenant,k) or (p_scope='branch' and k='roles.manage')) then raise exception 'Invalid or elevated permission grant' using errcode='42501'; end if;
 if p_id is not null and exists(select 1 from public.business_roles where id=p_id and scope<>p_scope) then raise exception 'Role scope cannot change; create a new role'; end if;
 insert into public.business_roles(id,tenant_id,name,scope) values(r,p_tenant,trim(p_name),p_scope)
 on conflict(id) do update set name=excluded.name,updated_at=now();
 delete from public.business_role_permissions where tenant_id=p_tenant and role_id=r;
 insert into public.business_role_permissions select p_tenant,r,k from (select distinct unnest(p_permissions) k) s;
 return r;
end $$;
create function public.save_employee(p_tenant uuid,p_id uuid,p_full_name text,p_phone text,p_email text,p_job_title text,p_status text,p_start_date date,p_notes text,p_branches uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.employees; eid uuid:=coalesce(p_id,gen_random_uuid()); old_ids uuid[]; m public.tenant_memberships; overrides jsonb;
begin
 perform private.check_branch_array(p_tenant,p_branches);
 if p_id is null then
 if not private.branches_allowed(p_tenant,p_branches,'employees.create') then raise exception 'Employee creation denied' using errcode='42501'; end if;
 else
 select * into e from public.employees where tenant_id=p_tenant and id=p_id for update;
 if e.id is null or not private.employee_allowed(p_tenant,e.id,'employees.update') then raise exception 'Employee update denied' using errcode='42501'; end if;
 end if;
 if not private.branches_allowed(p_tenant,p_branches,case when p_id is null then 'employees.create' else 'employees.update' end) then raise exception 'Unauthorized employee branch' using errcode='42501'; end if;
 if (p_status='archived' or e.status='archived') and (not private.branches_allowed(p_tenant,p_branches,'employees.archive') or (e.id is not null and not private.employee_allowed(p_tenant,e.id,'employees.archive'))) then raise exception 'Employee archive denied' using errcode='42501'; end if;
 if e.user_id is not null and p_status<>'active' and exists(select 1 from public.tenants where id=p_tenant and owner_id=e.user_id) then raise exception 'Owner employee must remain active' using errcode='42501'; end if;
 select coalesce(array_agg(branch_id order by branch_id),'{}') into old_ids from public.employee_branches where tenant_id=p_tenant and employee_id=eid;
 if e.user_id is not null and old_ids is distinct from (select coalesce(array_agg(x order by x),'{}') from (select distinct unnest(p_branches) x) s)
 and not private.has_permission(p_tenant,'roles.manage') then raise exception 'Role management required to change login assignments' using errcode='42501'; end if;
 insert into public.employees(id,tenant_id,full_name,phone,email,job_title,status,start_date,notes)
 values(eid,p_tenant,trim(p_full_name),trim(p_phone),nullif(lower(trim(p_email)),''),trim(p_job_title),p_status,p_start_date,p_notes)
 on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email,job_title=excluded.job_title,
 status=excluded.status,start_date=excluded.start_date,notes=excluded.notes,updated_at=now();
 delete from public.employee_branches where tenant_id=p_tenant and employee_id=eid and not(branch_id=any(coalesce(p_branches,'{}')));
 insert into public.employee_branches select p_tenant,eid,x from (select distinct unnest(p_branches) x) s on conflict do nothing;
 if e.user_id is not null then
 select * into m from public.tenant_memberships where tenant_id=p_tenant and user_id=e.user_id;
 select coalesce(jsonb_object_agg(branch_id::text,role_id::text) filter(where role_id is not null),'{}') into overrides from public.branch_memberships where tenant_id=p_tenant and user_id=e.user_id and branch_id=any(p_branches);
 -- Do not call the active-access guard while deactivating: status gating
 -- immediately revokes access without destroying historical memberships.
 delete from public.branch_memberships where tenant_id=p_tenant and user_id=e.user_id and not(branch_id=any(coalesce(p_branches,'{}')));
 insert into public.branch_memberships(tenant_id,user_id,branch_id,role_id) select p_tenant,e.user_id,x,(overrides->>x::text)::uuid from (select distinct unnest(p_branches) x) s on conflict do nothing;
 end if;
 return eid;
end $$;

create function public.archive_employee(p_tenant uuid,p_employee uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees;
begin
 select * into e from public.employees where tenant_id=p_tenant and id=p_employee for update;
 if e.id is null or not private.employee_allowed(p_tenant,p_employee,'employees.archive') then raise exception 'Employee archive denied' using errcode='42501'; end if;
 if exists(select 1 from public.tenants where id=p_tenant and owner_id=e.user_id) then raise exception 'Owner employee must remain active' using errcode='42501'; end if;
 update public.employees set status='archived',updated_at=now() where tenant_id=p_tenant and id=p_employee;
end $$;
revoke all on function public.archive_employee(uuid,uuid) from public,anon;
grant execute on function public.archive_employee(uuid,uuid) to authenticated;

create function public.get_employee_salary(p_tenant uuid,p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.employee_allowed(p_tenant,p_employee,'salaries.view') then raise exception 'Salary access denied' using errcode='42501'; end if;
 select jsonb_build_object('salary_type',salary_type,'amount',amount::text,'percentage',percentage::text,'bonus_amount',bonus_amount::text,
 'bonus_percentage',bonus_percentage::text,'bonus_basis',bonus_basis,'currency',currency,'updated_at',updated_at) into result from public.employee_salary_settings where tenant_id=p_tenant and employee_id=p_employee;
 return result;
end $$;
create function public.salary_history(p_tenant uuid,p_employee uuid) returns setof public.employee_salary_history
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.employee_allowed(p_tenant,p_employee,'salaries.view') then raise exception 'Salary access denied' using errcode='42501'; end if;
 return query select * from public.employee_salary_history where tenant_id=p_tenant and employee_id=p_employee order by created_at desc,id;
end $$;
create function public.save_employee_salary(p_tenant uuid,p_employee uuid,p_type text,p_amount text,p_percentage text,p_bonus_amount text,p_bonus_percentage text,p_bonus_basis text,p_currency text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare old_config jsonb; new_config jsonb; value text;
begin
 perform 1 from public.employees where tenant_id=p_tenant and id=p_employee and status<>'archived' for update;
 if not found or not private.employee_allowed(p_tenant,p_employee,'salaries.manage') or not private.employee_allowed(p_tenant,p_employee,'salaries.view') then raise exception 'Salary management denied' using errcode='42501'; end if;
 foreach value in array array[p_amount,p_bonus_amount] loop if coalesce(value,'')<>'' and value !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' then raise exception 'Invalid exact amount'; end if; end loop;
 foreach value in array array[p_percentage,p_bonus_percentage] loop if coalesce(value,'')<>'' and value !~ '^[0-9]{1,3}(\.[0-9]{1,4})?$' then raise exception 'Invalid percentage'; end if; end loop;
 old_config:=public.get_employee_salary(p_tenant,p_employee);
 insert into public.employee_salary_settings(tenant_id,employee_id,salary_type,amount,percentage,bonus_amount,bonus_percentage,bonus_basis,currency,updated_by)
 values(p_tenant,p_employee,p_type,nullif(p_amount,'')::numeric,nullif(p_percentage,'')::numeric,nullif(p_bonus_amount,'')::numeric,
 nullif(p_bonus_percentage,'')::numeric,trim(p_bonus_basis),p_currency,auth.uid()) on conflict(tenant_id,employee_id) do update set
 salary_type=excluded.salary_type,amount=excluded.amount,percentage=excluded.percentage,bonus_amount=excluded.bonus_amount,
 bonus_percentage=excluded.bonus_percentage,bonus_basis=excluded.bonus_basis,currency=excluded.currency,updated_at=now(),updated_by=excluded.updated_by;
 new_config:=public.get_employee_salary(p_tenant,p_employee);
 insert into public.employee_salary_history(tenant_id,employee_id,previous_settings,new_settings,reason,changed_by) values(p_tenant,p_employee,old_config,new_config,trim(p_reason),auth.uid());
end $$;

create function public.create_employee_invitation(p_tenant uuid,p_employee uuid,p_role uuid) returns text
language plpgsql security definer set search_path='' as $$
declare e public.employees; token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 if not private.is_business_owner(p_tenant) then raise exception 'Only Owner can invite' using errcode='42501'; end if;
 select * into e from public.employees where tenant_id=p_tenant and id=p_employee for update;
 if e.id is null or e.status<>'active' or e.email is null or e.user_id is not null then raise exception 'An active unlinked employee with email is required'; end if;
 perform private.check_delegation(p_tenant,p_role);
 if (select scope from public.business_roles where id=p_role)='branch' and not exists(select 1 from public.employee_branches where employee_id=e.id and tenant_id=p_tenant) then raise exception 'Assign a branch before inviting'; end if;
 update public.employee_invitations set revoked_at=now() where employee_id=e.id and tenant_id=p_tenant and accepted_at is null and revoked_at is null;
 insert into public.employee_invitations(tenant_id,employee_id,email,role_id,token_hash,invited_by)
 values(p_tenant,e.id,e.email,p_role,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
 return token;
end $$;
create function public.revoke_employee_invitation(p_tenant uuid,p_employee uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_business_owner(p_tenant) then raise exception 'Only Owner can revoke' using errcode='42501'; end if;
 perform 1 from public.employees where tenant_id=p_tenant and id=p_employee for update;
 update public.employee_invitations set revoked_at=now() where tenant_id=p_tenant and employee_id=p_employee and accepted_at is null and revoked_at is null;
end $$;
create function public.preview_employee_invitation(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select jsonb_build_object('business',t.name,'employee',e.full_name,'role',r.name,'scope',r.scope,'expires_at',i.expires_at) into result
 from public.employee_invitations i join public.tenants t on t.id=i.tenant_id join public.employees e on e.id=i.employee_id and e.tenant_id=i.tenant_id
 join public.business_roles r on r.id=i.role_id and r.tenant_id=i.tenant_id join auth.users u on u.id=auth.uid()
 where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and i.revoked_at is null and i.accepted_at is null and i.expires_at>now()
 and lower(u.email)=i.email and u.email_confirmed_at is not null and e.status='active' and e.email=i.email and e.user_id is null
 and t.owner_id=i.invited_by and private.member_enabled(t.id,i.invited_by);
 if result is null then raise exception 'Invitation unavailable or account email does not match' using errcode='42501'; end if;
 return result;
end $$;
create function public.accept_employee_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.employee_invitations; ids uuid[];
begin
 -- Serialize accept/revoke/edit against the employee, then recheck every fact.
 select * into i from public.employee_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if i.id is null then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 perform 1 from public.tenants where id=i.tenant_id for update;
 perform 1 from public.employees where tenant_id=i.tenant_id and id=i.employee_id for update;
 perform 1 from public.employee_invitations where id=i.id for update;
 perform public.preview_employee_invitation(p_token);
 if exists(select 1 from public.employees where tenant_id=i.tenant_id and user_id=auth.uid()) then raise exception 'Account already linked in this business'; end if;
 select coalesce(array_agg(branch_id),'{}') into ids from public.employee_branches where tenant_id=i.tenant_id and employee_id=i.employee_id;
 perform private.apply_member_access(i.tenant_id,auth.uid(),i.role_id,ids,'{}',true);
 update public.employees set user_id=auth.uid(),updated_at=now() where tenant_id=i.tenant_id and id=i.employee_id;
 update public.employee_invitations set accepted_at=now() where id=i.id;
 return i.tenant_id;
end $$;

-- No new function is accidentally callable via PUBLIC defaults.
revoke all on function private.is_business_owner(uuid),private.check_branch_array(uuid,uuid[]),private.branches_allowed(uuid,uuid[],text),
 private.check_delegation(uuid,uuid,uuid),private.apply_member_access(uuid,uuid,uuid,uuid[],jsonb,boolean) from public,anon,authenticated;
revoke all on function public.assign_member_role(uuid,uuid,uuid,uuid[],jsonb,boolean),public.save_business_role(uuid,uuid,text,text,text[]),
 public.save_employee(uuid,uuid,text,text,text,text,text,date,text,uuid[]),public.get_employee_salary(uuid,uuid),public.salary_history(uuid,uuid),
 public.save_employee_salary(uuid,uuid,text,text,text,text,text,text,text,text),public.create_employee_invitation(uuid,uuid,uuid),
 public.revoke_employee_invitation(uuid,uuid),public.preview_employee_invitation(text),public.accept_employee_invitation(text) from public,anon;
grant execute on function public.assign_member_role(uuid,uuid,uuid,uuid[],jsonb,boolean),public.save_business_role(uuid,uuid,text,text,text[]),
 public.save_employee(uuid,uuid,text,text,text,text,text,date,text,uuid[]),public.get_employee_salary(uuid,uuid),public.salary_history(uuid,uuid),
 public.save_employee_salary(uuid,uuid,text,text,text,text,text,text,text,text),public.create_employee_invitation(uuid,uuid,uuid),
 public.revoke_employee_invitation(uuid,uuid),public.preview_employee_invitation(text),public.accept_employee_invitation(text) to authenticated;
