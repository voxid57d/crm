create function private.customer_employee_visible(t uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employees where tenant_id=t and id=e and status='active') and
 private.branches_allowed(t,(select coalesce(array_agg(branch_id),'{}') from public.employee_branches where tenant_id=t and employee_id=e),'customers.view');
$$;
create function public.customer_employee_choices(p_tenant uuid) returns table(id uuid,full_name text)
language sql stable security definer set search_path='' as $$
 select e.id,e.full_name from public.employees e where e.tenant_id=p_tenant and private.customer_employee_visible(p_tenant,e.id) order by e.full_name,e.id;
$$;
create function public.save_customer_setting(p_tenant uuid,p_id uuid,p_kind text,p_name text,p_type text default 'text',p_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 if not private.has_permission(p_tenant,case when p_kind='tag' then 'customers.manage_tags' else 'customers.manage_settings' end) then raise exception 'Customer settings denied' using errcode='42501'; end if;
 if p_active is null then raise exception 'Choose setting status'; end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if p_kind='status' then
 if p_id is not null and not exists(select 1 from public.customer_statuses where tenant_id=p_tenant and id=p_id) then raise exception 'Setting unavailable' using errcode='42501'; end if;
 insert into public.customer_statuses(id,tenant_id,name,is_active) values(v_id,p_tenant,trim(p_name),p_active) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 elsif p_kind='tag' then
 if p_id is not null and not exists(select 1 from public.customer_tags where tenant_id=p_tenant and id=p_id) then raise exception 'Setting unavailable' using errcode='42501'; end if;
 insert into public.customer_tags(id,tenant_id,name,is_active) values(v_id,p_tenant,trim(p_name),p_active) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 elsif p_kind='field' then
 if p_id is not null and not exists(select 1 from public.customer_field_definitions where tenant_id=p_tenant and id=p_id and field_type=p_type) then raise exception 'Field unavailable or type changed' using errcode='42501'; end if;
 insert into public.customer_field_definitions(id,tenant_id,name,field_type,is_active) values(v_id,p_tenant,trim(p_name),p_type,p_active) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 else raise exception 'Unknown setting type'; end if;
 return v_id;
end $$;
create function public.save_customer(p_tenant uuid,p_id uuid,p_profile jsonb,p_branches uuid[],p_tags uuid[] default '{}',p_student jsonb default null,p_fields jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.customers; v_id uuid:=coalesce(p_id,gen_random_uuid()); v_status uuid; v_employee uuid; v_dob date;
 old_branches uuid[]; old_tags uuid[]; old_student jsonb; old_fields jsonb; f record; definition public.customer_field_definitions;
begin
 -- Lock tenant before record to keep write order consistent with role/setting operations.
 perform 1 from public.tenants where id=p_tenant for update;
 if p_id is not null then
 select * into c from public.customers where tenant_id=p_tenant and id=p_id for update;
 if c.id is null or not private.customer_allowed(p_tenant,p_id,'customers.view') or not private.customer_allowed(p_tenant,p_id,'customers.update') then raise exception 'Customer update denied' using errcode='42501'; end if;
 if c.archived_at is not null then raise exception 'Restore customer before editing'; end if;
 end if;
 if not private.branches_allowed(p_tenant,p_branches,case when p_id is null then 'customers.create' else 'customers.update' end)
 or not private.branches_allowed(p_tenant,p_branches,'customers.view') then raise exception 'Customer branch access denied' using errcode='42501'; end if;
 perform private.check_branch_array(p_tenant,p_branches);
 if jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_fields) is distinct from 'object' then raise exception 'Invalid customer fields'; end if;
 v_status:=nullif(p_profile->>'status_id','')::uuid;
 if v_status is null then select id into v_status from public.customer_statuses where tenant_id=p_tenant and is_default; end if;
 if not exists(select 1 from public.customer_statuses where tenant_id=p_tenant and id=v_status and (is_active or id=c.status_id)) then raise exception 'Invalid customer status' using errcode='42501'; end if;
 v_employee:=nullif(p_profile->>'responsible_employee_id','')::uuid;
 if v_employee is not null and (not private.customer_employee_visible(p_tenant,v_employee) or
 (cardinality(p_branches)>0 and not exists(select 1 from public.employee_branches where tenant_id=p_tenant and employee_id=v_employee and branch_id=any(p_branches)))) then raise exception 'Responsible employee is outside customer scope' using errcode='42501'; end if;
 v_dob:=nullif(p_profile->>'date_of_birth','')::date;
 if v_dob>current_date then raise exception 'Date of birth cannot be in the future'; end if;
 if exists(select 1 from unnest(p_tags) x where x is null or not exists(select 1 from public.customer_tags where tenant_id=p_tenant and id=x and (is_active or exists(select 1 from public.customer_tag_links where tenant_id=p_tenant and customer_id=v_id and tag_id=x)))) then raise exception 'Invalid customer tag' using errcode='42501'; end if;
 select coalesce(array_agg(branch_id order by branch_id),'{}') into old_branches from public.customer_branches where tenant_id=p_tenant and customer_id=v_id;
 select coalesce(array_agg(tag_id order by tag_id),'{}') into old_tags from public.customer_tag_links where tenant_id=p_tenant and customer_id=v_id;
 select to_jsonb(s) into old_student from public.student_profiles s where tenant_id=p_tenant and customer_id=v_id;
 select coalesce(jsonb_object_agg(field_id::text,value),'{}') into old_fields from public.customer_field_values where tenant_id=p_tenant and customer_id=v_id;
 insert into public.customers(id,tenant_id,first_name,last_name,phone,additional_phone,email,date_of_birth,gender,address,status_id,responsible_employee_id)
 values(v_id,p_tenant,trim(p_profile->>'first_name'),coalesce(trim(p_profile->>'last_name'),''),trim(p_profile->>'phone'),nullif(trim(p_profile->>'additional_phone'),''),nullif(lower(trim(p_profile->>'email')),''),v_dob,nullif(p_profile->>'gender',''),nullif(trim(p_profile->>'address'),''),v_status,v_employee)
 on conflict(id) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,additional_phone=excluded.additional_phone,email=excluded.email,date_of_birth=excluded.date_of_birth,gender=excluded.gender,address=excluded.address,status_id=excluded.status_id,responsible_employee_id=excluded.responsible_employee_id,updated_at=now();
 delete from public.customer_branches where tenant_id=p_tenant and customer_id=v_id and not(branch_id=any(coalesce(p_branches,'{}')));
 insert into public.customer_branches select p_tenant,v_id,x from (select distinct unnest(p_branches) x) s on conflict do nothing;
 delete from public.customer_tag_links where tenant_id=p_tenant and customer_id=v_id and not(tag_id=any(coalesce(p_tags,'{}')));
 insert into public.customer_tag_links select p_tenant,v_id,x from (select distinct unnest(p_tags) x) s on conflict do nothing;
 if p_student is not null then
 if jsonb_typeof(p_student)<>'object' then raise exception 'Invalid student profile'; end if;
 insert into public.student_profiles(tenant_id,customer_id,student_identifier,education_status,school,education_level,learning_goals,additional_information,enrollment_date)
 values(p_tenant,v_id,trim(p_student->>'student_identifier'),p_student->>'education_status',nullif(trim(p_student->>'school'),''),nullif(trim(p_student->>'education_level'),''),nullif(trim(p_student->>'learning_goals'),''),nullif(trim(p_student->>'additional_information'),''),nullif(p_student->>'enrollment_date','')::date)
 on conflict(tenant_id,customer_id) do update set student_identifier=excluded.student_identifier,education_status=excluded.education_status,school=excluded.school,education_level=excluded.education_level,learning_goals=excluded.learning_goals,additional_information=excluded.additional_information,enrollment_date=excluded.enrollment_date,updated_at=now();
 end if;
 for f in select key,value from jsonb_each_text(p_fields) loop
 select * into definition from public.customer_field_definitions where tenant_id=p_tenant and id=f.key::uuid;
 if definition.id is null then raise exception 'Foreign custom field' using errcode='42501'; end if;
 if not definition.is_active then
 if coalesce(old_fields->>f.key,'') is distinct from coalesce(f.value,'') then raise exception 'Inactive field is read-only'; end if;
 continue;
 end if;
 if coalesce(f.value,'')='' then delete from public.customer_field_values where tenant_id=p_tenant and customer_id=v_id and field_id=definition.id; continue; end if;
 if definition.field_type='number' and f.value !~ '^-?[0-9]{1,16}(\.[0-9]{1,6})?$' then raise exception 'Invalid custom number'; end if;
 if definition.field_type='boolean' and f.value not in ('true','false') then raise exception 'Invalid custom boolean'; end if;
 if definition.field_type='date' then
 if f.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid custom date'; end if;
 perform f.value::date;
 end if;
 insert into public.customer_field_values(tenant_id,customer_id,field_id,value) values(p_tenant,v_id,definition.id,f.value) on conflict(tenant_id,customer_id,field_id) do update set value=excluded.value;
 end loop;
 if c.id is null then perform private.customer_audit(p_tenant,v_id,'created',jsonb_build_object('profile',(select to_jsonb(x) from public.customers x where id=v_id)));
 else
 perform private.customer_audit(p_tenant,v_id,'profile_updated',jsonb_build_object('before',to_jsonb(c),'after',(select to_jsonb(x) from public.customers x where id=v_id)));
 if c.status_id<>v_status then perform private.customer_audit(p_tenant,v_id,'status_changed',jsonb_build_object('before',c.status_id,'after',v_status)); end if;
 if c.responsible_employee_id is distinct from v_employee then perform private.customer_audit(p_tenant,v_id,'responsible_changed',jsonb_build_object('before',c.responsible_employee_id,'after',v_employee)); end if;
 end if;
 if old_branches is distinct from (select coalesce(array_agg(x order by x),'{}') from (select distinct unnest(p_branches) x) s) then perform private.customer_audit(p_tenant,v_id,'branches_changed',jsonb_build_object('before',old_branches,'after',p_branches)); end if;
 if old_tags is distinct from (select coalesce(array_agg(x order by x),'{}') from (select distinct unnest(p_tags) x) s) then perform private.customer_audit(p_tenant,v_id,'tags_changed',jsonb_build_object('before',old_tags,'after',p_tags)); end if;
 if p_student is not null then perform private.customer_audit(p_tenant,v_id,'student_updated',jsonb_build_object('before',old_student,'after',(select to_jsonb(s) from public.student_profiles s where tenant_id=p_tenant and customer_id=v_id))); end if;
 if p_fields<>'{}'::jsonb then perform private.customer_audit(p_tenant,v_id,'custom_fields_updated',jsonb_build_object('before',old_fields,'submitted',p_fields)); end if;
 return v_id;
end $$;

create function public.archive_customer(p_tenant uuid,p_customer uuid,p_archive boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.customers;
begin
 select * into c from public.customers where tenant_id=p_tenant and id=p_customer for update;
 if c.id is null or not private.customer_allowed(p_tenant,p_customer,'customers.view') or not private.customer_allowed(p_tenant,p_customer,'customers.archive') then raise exception 'Customer archive denied' using errcode='42501'; end if;
 if p_archive is null then raise exception 'Choose archive action'; end if;
 if (c.archived_at is not null)=p_archive then return; end if;
 update public.customers set archived_at=case when p_archive then now() else null end,updated_at=now() where tenant_id=p_tenant and id=p_customer;
 perform private.customer_audit(p_tenant,p_customer,case when p_archive then 'archived' else 'restored' end);
end $$;
create function public.save_customer_note(p_tenant uuid,p_customer uuid,p_id uuid,p_body text,p_kind text default 'note') returns uuid language plpgsql security definer set search_path='' as $$
declare n public.customer_notes; v_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 perform 1 from public.customers where tenant_id=p_tenant and id=p_customer and archived_at is null for update;
 if not found or not private.customer_allowed(p_tenant,p_customer,'customers.view') or not private.customer_allowed(p_tenant,p_customer,'customers.view_notes') or not private.customer_allowed(p_tenant,p_customer,'customers.manage_notes') then raise exception 'Customer notes denied' using errcode='42501'; end if;
 if p_id is not null then
 select * into n from public.customer_notes where tenant_id=p_tenant and customer_id=p_customer and id=p_id;
 if n.id is null or n.author_id<>auth.uid() then raise exception 'Only author can edit this note' using errcode='42501'; end if;
 end if;
 insert into public.customer_notes(id,tenant_id,customer_id,body,kind,author_id,author_name) values(v_id,p_tenant,p_customer,trim(p_body),p_kind,auth.uid(),coalesce((select nullif(full_name,'') from public.profiles where id=auth.uid()),'Account '||auth.uid()::text))
 on conflict(id) do update set body=excluded.body,kind=excluded.kind,updated_at=now();
 perform private.customer_audit(p_tenant,p_customer,case when p_id is null then 'note_added' else 'note_edited' end,jsonb_build_object('note_id',v_id,'kind',p_kind,'before',n.body,'after',trim(p_body)),true);
 return v_id;
end $$;
create function public.save_student_guardian(p_tenant uuid,p_customer uuid,p_guardian uuid,p_full_name text,p_phone text,p_email text,p_relationship text,p_emergency boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_guardian,gen_random_uuid()); g public.guardians; changed boolean;
begin
 perform 1 from public.tenants where id=p_tenant for update;
 perform 1 from public.customers where tenant_id=p_tenant and id=p_customer and archived_at is null for update;
 if not found or not private.customer_allowed(p_tenant,p_customer,'customers.view') or not private.customer_allowed(p_tenant,p_customer,'customers.update') then raise exception 'Guardian update denied' using errcode='42501'; end if;
 if not exists(select 1 from public.student_profiles where tenant_id=p_tenant and customer_id=p_customer) then raise exception 'Student profile required'; end if;
 if p_guardian is not null then
 select * into g from public.guardians where tenant_id=p_tenant and id=p_guardian for update;
 if g.id is null or not private.guardian_allowed(p_tenant,p_guardian,'customers.view') then raise exception 'Guardian unavailable' using errcode='42501'; end if;
 end if;
 -- Blank name/phone when linking an existing guardian preserves shared contact data.
 changed:=g.id is null or (coalesce(trim(p_full_name),'')<>'' and (g.full_name is distinct from trim(p_full_name) or g.phone is distinct from trim(p_phone) or g.email is distinct from nullif(lower(trim(p_email)),'')));
 if changed then
 if g.id is not null and (not private.guardian_allowed(p_tenant,p_guardian,'customers.update',true) or not private.guardian_allowed(p_tenant,p_guardian,'customers.view',true)) then raise exception 'Shared guardian update requires all student scopes' using errcode='42501'; end if;
 insert into public.guardians(id,tenant_id,full_name,phone,email) values(v_id,p_tenant,trim(p_full_name),trim(p_phone),nullif(lower(trim(p_email)),'')) on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email,updated_at=now();
 end if;
 insert into public.student_guardians(tenant_id,customer_id,guardian_id,relationship,is_emergency) values(p_tenant,p_customer,v_id,trim(p_relationship),p_emergency)
 on conflict(tenant_id,customer_id,guardian_id) do update set relationship=excluded.relationship,is_emergency=excluded.is_emergency;
 perform private.customer_audit(p_tenant,p_customer,'guardian_linked',jsonb_build_object('guardian_id',v_id,'relationship',trim(p_relationship),'emergency',p_emergency));
 if changed then
 perform private.customer_audit(p_tenant,p_customer,'guardian_updated',jsonb_build_object('guardian_id',v_id,'before',to_jsonb(g),'after',(select to_jsonb(x) from public.guardians x where id=v_id)));
 -- Every other affected student's protected timeline records the shared edit.
 perform private.customer_audit(p_tenant,sg.customer_id,'guardian_updated',jsonb_build_object('guardian_id',v_id,'before',to_jsonb(g),'after',(select to_jsonb(x) from public.guardians x where id=v_id))) from public.student_guardians sg where sg.tenant_id=p_tenant and sg.guardian_id=v_id and sg.customer_id<>p_customer;
 end if;
 return v_id;
end $$;
create function public.unlink_student_guardian(p_tenant uuid,p_customer uuid,p_guardian uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.customers where tenant_id=p_tenant and id=p_customer and archived_at is null for update;
 if not found or not private.customer_allowed(p_tenant,p_customer,'customers.view') or not private.customer_allowed(p_tenant,p_customer,'customers.update') then raise exception 'Guardian update denied' using errcode='42501'; end if;
 delete from public.student_guardians where tenant_id=p_tenant and customer_id=p_customer and guardian_id=p_guardian;
 if found then perform private.customer_audit(p_tenant,p_customer,'guardian_unlinked',jsonb_build_object('guardian_id',p_guardian)); end if;
end $$;

create function public.customer_directory(p_tenant uuid,p_search text default '',p_branch uuid default null,p_status uuid default null,p_employee uuid default null,p_tag uuid default null,p_archived boolean default false,p_students boolean default false,p_sort text default 'name',p_page integer default 0)
returns table(id uuid,first_name text,last_name text,phone text,email text,status_id uuid,status_name text,responsible_employee_id uuid,responsible_name text,branch_ids uuid[],tag_names text[],student_identifier text,archived_at timestamptz,created_at timestamptz,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception 'Business access denied' using errcode='42501'; end if;
 if p_branch is not null and not private.has_permission(p_tenant,'customers.view',p_branch) then raise exception 'Branch access denied' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_sort not in ('name','newest','oldest') or length(p_search)>100 then raise exception 'Invalid directory filters'; end if;
 return query select c.id,c.first_name,c.last_name,c.phone,c.email,c.status_id,s.name,c.responsible_employee_id,
 case when private.customer_employee_visible(p_tenant,c.responsible_employee_id) then e.full_name else null end,
 array(select cb.branch_id from public.customer_branches cb where cb.tenant_id=p_tenant and cb.customer_id=c.id order by cb.branch_id),
 array(select t.name from public.customer_tag_links ct join public.customer_tags t on t.tenant_id=ct.tenant_id and t.id=ct.tag_id where ct.tenant_id=p_tenant and ct.customer_id=c.id order by t.name),sp.student_identifier,c.archived_at,c.created_at,count(*) over()
 from public.customers c join public.customer_statuses s on s.tenant_id=c.tenant_id and s.id=c.status_id
 left join public.employees e on e.tenant_id=c.tenant_id and e.id=c.responsible_employee_id
 left join public.student_profiles sp on sp.tenant_id=c.tenant_id and sp.customer_id=c.id
 where c.tenant_id=p_tenant and private.customer_allowed(p_tenant,c.id,'customers.view') and (c.archived_at is not null)=p_archived
 and (not p_students or sp.customer_id is not null)
 and (p_search='' or position(lower(p_search) in lower(c.first_name||' '||c.last_name))>0 or position(lower(p_search) in lower(coalesce(c.email,'')))>0 or position(p_search in c.phone)>0 or
 (length(regexp_replace(p_search,'[^0-9]','','g'))>=3 and (position(regexp_replace(p_search,'[^0-9]','','g') in regexp_replace(c.phone,'[^0-9]','','g'))>0 or position(regexp_replace(p_search,'[^0-9]','','g') in regexp_replace(coalesce(c.additional_phone,''),'[^0-9]','','g'))>0)))
 and (p_branch is null or exists(select 1 from public.customer_branches cb where cb.tenant_id=p_tenant and cb.customer_id=c.id and cb.branch_id=p_branch))
 and (p_status is null or c.status_id=p_status) and (p_employee is null or c.responsible_employee_id=p_employee)
 and (p_tag is null or exists(select 1 from public.customer_tag_links ct where ct.tenant_id=p_tenant and ct.customer_id=c.id and ct.tag_id=p_tag))
 order by case when p_sort='name' then lower(c.first_name||' '||c.last_name) end,
 case when p_sort='newest' then c.created_at end desc,case when p_sort='oldest' then c.created_at end,c.id
 limit 20 offset p_page*20;
end $$;
create function public.customer_duplicate_candidates(p_tenant uuid,p_phone text default '',p_email text default '',p_name text default '',p_exclude uuid default null)
returns table(id uuid,full_name text,phone text,email text,archived boolean,match_reason text)
language sql stable security definer set search_path='' as $$
 select c.id,c.first_name||' '||c.last_name,c.phone,c.email,c.archived_at is not null,
 case when nullif(trim(p_email),'') is not null and lower(c.email)=lower(trim(p_email)) then 'Matching email'
 when length(regexp_replace(p_phone,'[^0-9]','','g'))>=3 and regexp_replace(p_phone,'[^0-9]','','g') in (regexp_replace(c.phone,'[^0-9]','','g'),regexp_replace(coalesce(c.additional_phone,''),'[^0-9]','','g')) then 'Matching phone' else 'Matching name' end
 from public.customers c where c.tenant_id=p_tenant and (p_exclude is null or c.id<>p_exclude) and private.customer_allowed(p_tenant,c.id,'customers.view') and
 ((nullif(trim(p_email),'') is not null and lower(c.email)=lower(trim(p_email))) or
 (length(regexp_replace(p_phone,'[^0-9]','','g'))>=3 and regexp_replace(p_phone,'[^0-9]','','g') in (regexp_replace(c.phone,'[^0-9]','','g'),regexp_replace(coalesce(c.additional_phone,''),'[^0-9]','','g'))) or
 (length(trim(p_name))>=3 and lower(trim(c.first_name||' '||c.last_name))=lower(trim(p_name)))) order by c.created_at desc,c.id limit 10;
$$;

revoke all on function private.customer_employee_visible(uuid,uuid) from public,anon,authenticated;
-- Explicit function grants, independent of PostgreSQL PUBLIC defaults.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('customer_employee_choices','save_customer_setting','save_customer','archive_customer','save_customer_note','save_student_guardian','unlink_student_guardian','customer_directory','customer_duplicate_candidates') loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
