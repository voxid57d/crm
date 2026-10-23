-- Sales is additive: existing customers, HR, memberships and history remain intact.
insert into public.permissions(key,description) select p,p from unnest(array[
 'leads.create','leads.update','leads.archive','leads.assign','leads.change_stage','leads.convert',
 'leads.manage_pipelines','leads.manage_sources','leads.view_analytics','leads.manage_followups']) p on conflict do nothing;
create table public.sales_pipelines (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 100),is_active boolean not null default true,is_default boolean not null default false,
 created_at timestamptz not null default now(),unique(tenant_id,id),unique(tenant_id,name),check(not is_default or is_active)
);
create unique index sales_default_pipeline_idx on public.sales_pipelines(tenant_id) where is_default;
create table public.sales_stages (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,pipeline_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 80),position integer not null check(position between 0 and 10000),
 color text not null default '#64748b' check(color ~ '^#[0-9a-fA-F]{6}$'),outcome text not null default 'open' check(outcome in ('open','won','lost','disqualified')),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique(tenant_id,id),unique(tenant_id,pipeline_id,id),
 unique(tenant_id,pipeline_id,name),foreign key(tenant_id,pipeline_id) references public.sales_pipelines(tenant_id,id)
);
create index sales_stages_order_idx on public.sales_stages(tenant_id,pipeline_id,position,id);
create table public.lead_sources (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 80),is_active boolean not null default true,unique(tenant_id,id),unique(tenant_id,name)
);
create table public.lead_loss_reasons (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 80),is_active boolean not null default true,unique(tenant_id,id),unique(tenant_id,name)
);
create table public.leads (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),branch_id uuid not null,
 first_name text not null check(length(trim(first_name)) between 1 and 100),last_name text not null default '' check(length(last_name)<=100),
 phone text not null check(length(trim(phone)) between 3 and 40 and phone ~ '[0-9]'),
 phone_normalized text generated always as (regexp_replace(phone,'[^0-9]','','g')) stored,
 secondary_phone text check(secondary_phone is null or (length(secondary_phone) between 3 and 40 and secondary_phone ~ '[0-9]')),
 email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 interested_service text check(length(interested_service)<=300),source_id uuid,assigned_employee_id uuid,
 pipeline_id uuid not null,stage_id uuid not null,priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','converted','lost','disqualified')),
 loss_reason_id uuid,lost_by uuid references auth.users(id),lost_at timestamptz,loss_notes text check(length(loss_notes)<=2000),
 customer_id uuid,converted_at timestamptz,converted_by uuid references auth.users(id),archived_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),foreign key(tenant_id,branch_id) references public.branches(tenant_id,id),
 foreign key(tenant_id,pipeline_id,stage_id) references public.sales_stages(tenant_id,pipeline_id,id),
 foreign key(tenant_id,source_id) references public.lead_sources(tenant_id,id),
 foreign key(tenant_id,loss_reason_id) references public.lead_loss_reasons(tenant_id,id),
 foreign key(tenant_id,assigned_employee_id) references public.employees(tenant_id,id),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 check((status='converted')=(customer_id is not null and converted_at is not null and converted_by is not null)),
 check((status in ('lost','disqualified'))=(loss_reason_id is not null and lost_at is not null and lost_by is not null))
);
create index leads_branch_idx on public.leads(tenant_id,branch_id,created_at desc,id);
create index leads_board_idx on public.leads(tenant_id,pipeline_id,stage_id,archived_at,updated_at desc);
create index leads_assignment_idx on public.leads(tenant_id,assigned_employee_id);
create index leads_phone_idx on public.leads(tenant_id,phone_normalized);
create index leads_customer_idx on public.leads(tenant_id,customer_id) where customer_id is not null;
create table public.lead_notes (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,lead_id uuid not null,
 body text not null check(length(trim(body)) between 1 and 5000),kind text not null check(kind in ('note','call','meeting','message','email')),
 author_id uuid not null references auth.users(id),author_name text not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,lead_id) references public.leads(tenant_id,id)
);
create table public.lead_activities (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,lead_id uuid not null,
 actor_id uuid not null references auth.users(id),actor_name text not null,kind text not null,detail jsonb not null default '{}',
 created_at timestamptz not null default now(),foreign key(tenant_id,lead_id) references public.leads(tenant_id,id)
);
create index lead_activity_idx on public.lead_activities(tenant_id,lead_id,created_at desc,id);
create index lead_notes_idx on public.lead_notes(tenant_id,lead_id,created_at desc,id);
create table public.lead_followups (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,lead_id uuid not null,responsible_employee_id uuid not null,
 kind text not null check(kind in ('phone_call','meeting','message','trial_lesson','follow_up')),
 description text not null check(length(trim(description)) between 1 and 2000),scheduled_at timestamptz not null,
 completed_at timestamptz,completed_by uuid references auth.users(id),outcome_notes text check(length(outcome_notes)<=3000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(tenant_id,lead_id) references public.leads(tenant_id,id),foreign key(tenant_id,responsible_employee_id) references public.employees(tenant_id,id),
 check((completed_at is null)=(completed_by is null))
);
create index lead_followup_due_idx on public.lead_followups(tenant_id,scheduled_at,lead_id) where completed_at is null;
create index lead_followup_owner_idx on public.lead_followups(tenant_id,responsible_employee_id,scheduled_at);
create table public.sales_configuration_history (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),actor_id uuid not null references auth.users(id),
 kind text not null,record_id uuid not null,before_value jsonb,after_value jsonb not null,created_at timestamptz not null default now()
);

create function private.seed_sales(t uuid) returns void language plpgsql security definer set search_path='' as $$
declare pipeline uuid;
begin
 insert into public.sales_pipelines(tenant_id,name,is_default) values(t,'Default sales pipeline',true) returning id into pipeline;
 insert into public.sales_stages(tenant_id,pipeline_id,name,position,outcome,color) select t,pipeline,n,p,o,c from (values
 ('New Lead',0,'open','#64748b'),('Contacted',1,'open','#3b82f6'),('Interested',2,'open','#8b5cf6'),('Trial Scheduled',3,'open','#06b6d4'),
 ('Trial Completed',4,'open','#14b8a6'),('Negotiation',5,'open','#f59e0b'),('Converted',6,'won','#16a34a'),('Lost',7,'lost','#ef4444'),('Disqualified',8,'disqualified','#78716c')) s(n,p,o,c);
 insert into public.lead_sources(tenant_id,name) select t,unnest(array['Walk-in','Phone Call','Telegram','Instagram','Facebook','Website','Referral','Advertisement','Other']);
 insert into public.lead_loss_reasons(tenant_id,name) select t,unnest(array['Too Expensive','No Response','Chose Competitor','Not Interested','Wrong Contact','Other']);
 insert into public.business_role_permissions(tenant_id,role_id,permission) select t,r.id,p.key from public.business_roles r cross join public.permissions p where r.tenant_id=t and
 ((r.system_key in ('owner','admin') and p.key like 'leads.%') or (r.system_key in ('manager','sales_manager') and p.key in
 ('leads.view','leads.create','leads.update','leads.assign','leads.change_stage','leads.convert','leads.view_analytics','leads.manage_followups'))) on conflict do nothing;
end $$;
create function private.seed_sales_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.seed_sales(new.id);return new;end $$;
create trigger zzz_seed_sales after insert on public.tenants for each row execute function private.seed_sales_trigger();
do $$ declare t record;begin for t in select id from public.tenants loop perform private.seed_sales(t.id);end loop;end $$;
-- Legacy custom roles reserve broad record management, without gaining conversion,
-- archive, analytics or configuration authority automatically.
insert into public.business_role_permissions(tenant_id,role_id,permission)
 select r.tenant_id,r.role_id,p from public.business_role_permissions r cross join unnest(array['leads.create','leads.update','leads.assign','leads.change_stage','leads.manage_followups']) p
 where r.permission='leads.manage' on conflict do nothing;
create function private.lead_allowed(t uuid,l uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.leads where tenant_id=t and id=l and private.has_permission(t,'leads.view',branch_id) and private.has_permission(t,p,branch_id));
$$;
create function private.lead_employee_eligible(t uuid,e uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employees emp join public.tenant_memberships m on m.tenant_id=emp.tenant_id and m.user_id=emp.user_id
 join public.business_roles r on r.tenant_id=m.tenant_id and r.id=m.role_id
 left join public.branch_memberships bm on bm.tenant_id=m.tenant_id and bm.user_id=m.user_id and bm.branch_id=b
 where emp.tenant_id=t and emp.id=e and emp.status='active' and private.member_enabled(t,m.user_id)
 and exists(select 1 from public.branches where tenant_id=t and id=b and is_active)
 and (r.scope='business' or bm.branch_id is not null)
 and exists(select 1 from public.business_role_permissions p where p.tenant_id=t and p.role_id=case when r.scope='business' then r.id else coalesce(bm.role_id,r.id) end and p.permission='leads.view')
 and exists(select 1 from public.business_role_permissions p where p.tenant_id=t and p.role_id=case when r.scope='business' then r.id else coalesce(bm.role_id,r.id) end and p.permission in ('leads.create','leads.update','leads.manage_followups')));
$$;
create function private.lead_audit(t uuid,l uuid,k text,d jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.lead_activities(tenant_id,lead_id,actor_id,actor_name,kind,detail)
 values(t,l,auth.uid(),coalesce((select nullif(full_name,'') from public.profiles where id=auth.uid()),'Account '||auth.uid()::text),k,d);
$$;
revoke all on function private.seed_sales(uuid),private.seed_sales_trigger(),private.lead_employee_eligible(uuid,uuid,uuid),private.lead_audit(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.lead_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.lead_allowed(uuid,uuid,text) to authenticated;
do $$ declare tbl text;begin foreach tbl in array array['sales_pipelines','sales_stages','lead_sources','lead_loss_reasons','leads','lead_notes','lead_activities','lead_followups','sales_configuration_history'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from anon,authenticated',tbl);
 execute format('grant select on public.%I to authenticated',tbl);
 end loop;end $$;
create policy pipelines_read on public.sales_pipelines for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy stages_read on public.sales_stages for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy sources_read on public.lead_sources for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy loss_reasons_read on public.lead_loss_reasons for select to authenticated using(private.has_permission(tenant_id,'tenant.read'));
create policy leads_read on public.leads for select to authenticated using(private.has_permission(tenant_id,'leads.view',branch_id));
create policy lead_notes_read on public.lead_notes for select to authenticated using(private.lead_allowed(tenant_id,lead_id,'leads.view'));
create policy lead_activity_read on public.lead_activities for select to authenticated using(private.lead_allowed(tenant_id,lead_id,'leads.view'));
create policy followups_read on public.lead_followups for select to authenticated using(private.lead_allowed(tenant_id,lead_id,'leads.view'));
create policy sales_configuration_read on public.sales_configuration_history for select to authenticated using(private.has_permission(tenant_id,'leads.manage_pipelines') or private.has_permission(tenant_id,'leads.manage_sources'));

create function public.sales_employee_choices(p_tenant uuid,p_branch uuid) returns table(id uuid,full_name text)
language sql stable security definer set search_path='' as $$
 select e.id,e.full_name from public.employees e where e.tenant_id=p_tenant and private.has_permission(p_tenant,'leads.view',p_branch) and private.lead_employee_eligible(p_tenant,e.id,p_branch) order by e.full_name,e.id;
$$;
create function public.save_lead(p_tenant uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.leads;v_id uuid:=coalesce(p_id,gen_random_uuid());b uuid;pipeline uuid;stage uuid;source uuid;emp uuid;
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception 'Business access denied' using errcode='42501';end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if p_id is not null then
 select * into l from public.leads where tenant_id=p_tenant and id=p_id for update;
 if l.id is null or not private.lead_allowed(p_tenant,p_id,'leads.update') then raise exception 'Lead update denied' using errcode='42501';end if;
 if l.archived_at is not null or l.status='converted' then raise exception 'Archived or converted lead cannot be edited';end if;
 end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid lead data';end if;
 b:=(p_data->>'branch_id')::uuid;pipeline:=(p_data->>'pipeline_id')::uuid;stage:=(p_data->>'stage_id')::uuid;
 source:=nullif(p_data->>'source_id','')::uuid;emp:=nullif(p_data->>'assigned_employee_id','')::uuid;
 if not private.has_permission(p_tenant,'leads.view',b) or not private.has_permission(p_tenant,case when p_id is null then 'leads.create' else 'leads.update' end,b) then raise exception 'Lead branch denied' using errcode='42501';end if;
 if not exists(select 1 from public.branches where tenant_id=p_tenant and id=b and is_active) then raise exception 'Active branch required';end if;
 if p_id is not null and (pipeline<>l.pipeline_id or stage<>l.stage_id) then raise exception 'Use stage transition to change pipeline or stage';end if;
 if not exists(select 1 from public.sales_stages s join public.sales_pipelines p on p.id=s.pipeline_id and p.tenant_id=s.tenant_id where s.tenant_id=p_tenant and s.pipeline_id=pipeline and s.id=stage and ((s.is_active and p.is_active and s.outcome='open') or s.id=l.stage_id)) then raise exception 'Invalid active pipeline/stage';end if;
 if source is not null and not exists(select 1 from public.lead_sources where tenant_id=p_tenant and id=source and (is_active or id=l.source_id)) then raise exception 'Invalid lead source';end if;
 if emp is distinct from l.assigned_employee_id or b is distinct from l.branch_id then
 if (emp is not null or l.assigned_employee_id is not null) and (not private.has_permission(p_tenant,'leads.assign',b) or (l.id is not null and not private.lead_allowed(p_tenant,l.id,'leads.assign'))) then raise exception 'Lead assignment denied' using errcode='42501';end if;
 if emp is not null and not private.lead_employee_eligible(p_tenant,emp,b) then raise exception 'Employee is not authorized for sales in this branch' using errcode='42501';end if;
 end if;
 insert into public.leads(id,tenant_id,branch_id,first_name,last_name,phone,secondary_phone,email,interested_service,source_id,assigned_employee_id,pipeline_id,stage_id,priority)
 values(v_id,p_tenant,b,trim(p_data->>'first_name'),coalesce(trim(p_data->>'last_name'),''),trim(p_data->>'phone'),nullif(trim(p_data->>'secondary_phone'),''),nullif(lower(trim(p_data->>'email')),''),nullif(trim(p_data->>'interested_service'),''),source,emp,pipeline,stage,coalesce(p_data->>'priority','normal'))
 on conflict(id) do update set branch_id=excluded.branch_id,first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,secondary_phone=excluded.secondary_phone,email=excluded.email,interested_service=excluded.interested_service,source_id=excluded.source_id,assigned_employee_id=excluded.assigned_employee_id,priority=excluded.priority,updated_at=now();
 perform private.lead_audit(p_tenant,v_id,case when l.id is null then 'created' else 'profile_updated' end,jsonb_build_object('before',to_jsonb(l),'after',(select to_jsonb(x) from public.leads x where id=v_id)));
 if l.assigned_employee_id is distinct from emp then perform private.lead_audit(p_tenant,v_id,'assignment_changed',jsonb_build_object('before',l.assigned_employee_id,'after',emp));end if;
 return v_id;
end $$;
create function public.move_lead(p_tenant uuid,p_lead uuid,p_stage uuid,p_expected_stage uuid,p_reason uuid default null,p_notes text default '') returns void language plpgsql security definer set search_path='' as $$
declare l public.leads;s public.sales_stages;
begin
 select * into l from public.leads where tenant_id=p_tenant and id=p_lead for update;
 if l.id is null or not private.lead_allowed(p_tenant,p_lead,'leads.change_stage') then raise exception 'Stage change denied' using errcode='42501';end if;
 if l.archived_at is not null or l.status='converted' then raise exception 'Archived or converted lead cannot move';end if;
 if p_expected_stage is distinct from l.stage_id then raise exception 'Lead changed. Reload before moving' using errcode='40001';end if;
 if l.stage_id=p_stage then return;end if;
 select * into s from public.sales_stages where tenant_id=p_tenant and id=p_stage and is_active;
 if s.id is null or not exists(select 1 from public.sales_pipelines where tenant_id=p_tenant and id=s.pipeline_id and is_active) then raise exception 'Active stage required';end if;
 if s.outcome='won' then raise exception 'Use customer conversion to enter a converted stage';end if;
 if l.status in ('lost','disqualified') and s.outcome='open' and not private.lead_allowed(p_tenant,p_lead,'leads.update') then raise exception 'Lead reopen denied' using errcode='42501';end if;
 if s.outcome in ('lost','disqualified') and not exists(select 1 from public.lead_loss_reasons where tenant_id=p_tenant and id=p_reason and is_active) then raise exception 'Active loss reason required';end if;
 if length(p_notes)>2000 then raise exception 'Loss notes too long';end if;
 update public.leads set pipeline_id=s.pipeline_id,stage_id=s.id,status=s.outcome,
 loss_reason_id=case when s.outcome in ('lost','disqualified') then p_reason else null end,
 lost_at=case when s.outcome in ('lost','disqualified') then now() else null end,
 lost_by=case when s.outcome in ('lost','disqualified') then auth.uid() else null end,
 loss_notes=case when s.outcome in ('lost','disqualified') then p_notes else null end,updated_at=now() where id=p_lead and tenant_id=p_tenant;
 perform private.lead_audit(p_tenant,p_lead,'stage_changed',jsonb_build_object('before',l.stage_id,'after',s.id,'old_pipeline',l.pipeline_id,'pipeline',s.pipeline_id));
 if s.outcome in ('lost','disqualified') then perform private.lead_audit(p_tenant,p_lead,s.outcome,jsonb_build_object('reason',p_reason,'notes',p_notes));
 elsif l.status in ('lost','disqualified') then perform private.lead_audit(p_tenant,p_lead,'reopened',jsonb_build_object('previous_reason',l.loss_reason_id,'previous_notes',l.loss_notes));end if;
end $$;
create function public.archive_lead(p_tenant uuid,p_lead uuid,p_archive boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.leads where tenant_id=p_tenant and id=p_lead for update;
 if not found or not private.lead_allowed(p_tenant,p_lead,'leads.archive') then raise exception 'Lead archive denied' using errcode='42501';end if;
 if p_archive is null then raise exception 'Choose archive action';end if;
 update public.leads set archived_at=case when p_archive then now() else null end,updated_at=now() where tenant_id=p_tenant and id=p_lead;
 perform private.lead_audit(p_tenant,p_lead,case when p_archive then 'archived' else 'restored' end);
end $$;
revoke all on function public.sales_employee_choices(uuid,uuid),public.save_lead(uuid,uuid,jsonb),public.move_lead(uuid,uuid,uuid,uuid,uuid,text),public.archive_lead(uuid,uuid,boolean) from public,anon;
grant execute on function public.sales_employee_choices(uuid,uuid),public.save_lead(uuid,uuid,jsonb),public.move_lead(uuid,uuid,uuid,uuid,uuid,text),public.archive_lead(uuid,uuid,boolean) to authenticated;
