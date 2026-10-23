create function public.save_sales_setting(p_tenant uuid,p_id uuid,p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid());before_value jsonb;after_value jsonb;pipeline uuid;v_outcome text;
begin
 if not private.has_permission(p_tenant,case when p_kind in ('source','loss_reason') then 'leads.manage_sources' else 'leads.manage_pipelines' end) then raise exception 'Sales configuration denied' using errcode='42501';end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid configuration';end if;
 if p_kind='pipeline' then
 select to_jsonb(p) into before_value from public.sales_pipelines p where tenant_id=p_tenant and id=p_id;
 if p_id is not null and before_value is null then raise exception 'Pipeline unavailable' using errcode='42501';end if;
 insert into public.sales_pipelines(id,tenant_id,name,is_active) values(v_id,p_tenant,trim(p_data->>'name'),coalesce((p_data->>'is_active')::boolean,true)) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 if p_id is null then
 insert into public.sales_stages(tenant_id,pipeline_id,name,position,outcome,color) values(p_tenant,v_id,'New Lead',0,'open','#64748b'),(p_tenant,v_id,'Converted',1,'won','#16a34a'),(p_tenant,v_id,'Lost',2,'lost','#ef4444'),(p_tenant,v_id,'Disqualified',3,'disqualified','#78716c');end if;
 select to_jsonb(p) into after_value from public.sales_pipelines p where id=v_id;
 elsif p_kind='stage' then
 select to_jsonb(s) into before_value from public.sales_stages s where tenant_id=p_tenant and id=p_id;
 if p_id is not null and before_value is null then raise exception 'Stage unavailable' using errcode='42501';end if;
 pipeline:=(p_data->>'pipeline_id')::uuid;v_outcome:=p_data->>'outcome';
 if not exists(select 1 from public.sales_pipelines where tenant_id=p_tenant and id=pipeline) then raise exception 'Pipeline unavailable' using errcode='42501';end if;
 if p_id is not null and (pipeline<>(before_value->>'pipeline_id')::uuid or v_outcome<>before_value->>'outcome') then raise exception 'Existing stage pipeline/outcome cannot change';end if;
 insert into public.sales_stages(id,tenant_id,pipeline_id,name,position,color,outcome,is_active)
 values(v_id,p_tenant,pipeline,trim(p_data->>'name'),(p_data->>'position')::integer,p_data->>'color',v_outcome,coalesce((p_data->>'is_active')::boolean,true))
 on conflict(id) do update set name=excluded.name,position=excluded.position,color=excluded.color,is_active=excluded.is_active;
 if not exists(select 1 from public.sales_stages where tenant_id=p_tenant and pipeline_id=pipeline and is_active and outcome='open') or
 not exists(select 1 from public.sales_stages where tenant_id=p_tenant and pipeline_id=pipeline and is_active and outcome='won') then raise exception 'Keep an active open and conversion stage';end if;
 select to_jsonb(s) into after_value from public.sales_stages s where id=v_id;
 elsif p_kind='source' then
 select to_jsonb(s) into before_value from public.lead_sources s where tenant_id=p_tenant and id=p_id;
 if p_id is not null and before_value is null then raise exception 'Source unavailable' using errcode='42501';end if;
 insert into public.lead_sources(id,tenant_id,name,is_active) values(v_id,p_tenant,trim(p_data->>'name'),coalesce((p_data->>'is_active')::boolean,true)) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 select to_jsonb(s) into after_value from public.lead_sources s where id=v_id;
 elsif p_kind='loss_reason' then
 select to_jsonb(s) into before_value from public.lead_loss_reasons s where tenant_id=p_tenant and id=p_id;
 if p_id is not null and before_value is null then raise exception 'Loss reason unavailable' using errcode='42501';end if;
 insert into public.lead_loss_reasons(id,tenant_id,name,is_active) values(v_id,p_tenant,trim(p_data->>'name'),coalesce((p_data->>'is_active')::boolean,true)) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 select to_jsonb(s) into after_value from public.lead_loss_reasons s where id=v_id;
 else raise exception 'Unknown sales configuration';end if;
 insert into public.sales_configuration_history(tenant_id,actor_id,kind,record_id,before_value,after_value) values(p_tenant,auth.uid(),p_kind,v_id,before_value,after_value);
 return v_id;
end $$;
create function public.reorder_sales_stages(p_tenant uuid,p_pipeline uuid,p_stages uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission(p_tenant,'leads.manage_pipelines') then raise exception 'Pipeline configuration denied' using errcode='42501';end if;
 perform 1 from public.tenants where id=p_tenant for update;
 if not exists(select 1 from public.sales_pipelines where tenant_id=p_tenant and id=p_pipeline) or
 coalesce(cardinality(p_stages),0)<>(select count(*) from public.sales_stages where tenant_id=p_tenant and pipeline_id=p_pipeline) or
 coalesce(cardinality(p_stages),0)<>(select count(distinct x) from unnest(p_stages) x) or
 exists(select 1 from unnest(p_stages) x where x is null or not exists(select 1 from public.sales_stages where tenant_id=p_tenant and pipeline_id=p_pipeline and id=x)) then raise exception 'Provide each pipeline stage exactly once';end if;
 insert into public.sales_configuration_history(tenant_id,actor_id,kind,record_id,before_value,after_value)
 select p_tenant,auth.uid(),'stage_order',p_pipeline,jsonb_agg(id order by position,id),to_jsonb(p_stages) from public.sales_stages where tenant_id=p_tenant and pipeline_id=p_pipeline;
 update public.sales_stages s set position=x.n-1 from unnest(p_stages) with ordinality x(id,n) where s.tenant_id=p_tenant and s.pipeline_id=p_pipeline and s.id=x.id;
end $$;
create function public.add_lead_note(p_tenant uuid,p_lead uuid,p_body text,p_kind text default 'note') returns uuid language plpgsql security definer set search_path='' as $$
declare note_id uuid;
begin
 perform 1 from public.leads where tenant_id=p_tenant and id=p_lead and archived_at is null for update;
 if not found or not private.lead_allowed(p_tenant,p_lead,'leads.update') then raise exception 'Lead note denied' using errcode='42501';end if;
 insert into public.lead_notes(tenant_id,lead_id,body,kind,author_id,author_name)
 values(p_tenant,p_lead,trim(p_body),p_kind,auth.uid(),coalesce((select nullif(full_name,'') from public.profiles where id=auth.uid()),'Account '||auth.uid()::text)) returning id into note_id;
 perform private.lead_audit(p_tenant,p_lead,p_kind||'_recorded',jsonb_build_object('note_id',note_id,'body',trim(p_body)));
 return note_id;
end $$;
create function public.save_lead_followup(p_tenant uuid,p_lead uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.leads;f public.lead_followups;v_id uuid:=coalesce(p_id,gen_random_uuid());emp uuid;scheduled timestamptz;
begin
 select * into l from public.leads where tenant_id=p_tenant and id=p_lead for update;
 if l.id is null or l.archived_at is not null or not private.lead_allowed(p_tenant,p_lead,'leads.manage_followups') then raise exception 'Follow-up denied' using errcode='42501';end if;
 if p_id is not null then
 select * into f from public.lead_followups where tenant_id=p_tenant and lead_id=p_lead and id=p_id for update;
 if f.id is null or f.completed_at is not null then raise exception 'Only pending follow-ups can be edited';end if;end if;
 emp:=(p_data->>'responsible_employee_id')::uuid;
 if not private.lead_employee_eligible(p_tenant,emp,l.branch_id) then raise exception 'Follow-up employee is outside sales scope' using errcode='42501';end if;
 -- Require a UTC offset so DB/session timezone never silently changes the time.
 if (p_data->>'scheduled_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Follow-up timestamp requires offset';end if;
 scheduled:=(p_data->>'scheduled_at')::timestamptz;
 insert into public.lead_followups(id,tenant_id,lead_id,responsible_employee_id,kind,description,scheduled_at)
 values(v_id,p_tenant,p_lead,emp,p_data->>'kind',trim(p_data->>'description'),scheduled)
 on conflict(id) do update set responsible_employee_id=excluded.responsible_employee_id,kind=excluded.kind,description=excluded.description,scheduled_at=excluded.scheduled_at,updated_at=now();
 perform private.lead_audit(p_tenant,p_lead,case when p_id is null then 'followup_scheduled' else 'followup_updated' end,jsonb_build_object('followup',v_id,'before',to_jsonb(f),'after',(select to_jsonb(x) from public.lead_followups x where id=v_id)));
 return v_id;
end $$;
create function public.complete_lead_followup(p_tenant uuid,p_followup uuid,p_outcome text) returns void language plpgsql security definer set search_path='' as $$
declare f public.lead_followups;
begin
 select * into f from public.lead_followups where tenant_id=p_tenant and id=p_followup;
 perform 1 from public.leads where tenant_id=p_tenant and id=f.lead_id and archived_at is null for update;
 if not found or not private.lead_allowed(p_tenant,f.lead_id,'leads.manage_followups') then raise exception 'Follow-up completion denied' using errcode='42501';end if;
 select * into f from public.lead_followups where tenant_id=p_tenant and id=p_followup for update;
 if f.completed_at is not null then return;end if;
 if p_outcome is null or length(trim(p_outcome)) not between 1 and 3000 then raise exception 'Outcome notes required';end if;
 update public.lead_followups set completed_at=now(),completed_by=auth.uid(),outcome_notes=trim(p_outcome),updated_at=now() where tenant_id=p_tenant and id=p_followup;
 perform private.lead_audit(p_tenant,f.lead_id,'followup_completed',jsonb_build_object('followup',p_followup,'outcome',trim(p_outcome)));
end $$;
create function public.convert_lead(p_tenant uuid,p_lead uuid,p_customer uuid default null,p_stage uuid default null,p_confirm_duplicate boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.leads;c public.customers;customer uuid;stage uuid;matches integer;
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception 'Business access denied' using errcode='42501';end if;
 -- Same tenant->record order as customer writes. Serializes duplicate conversion.
 perform 1 from public.tenants where id=p_tenant for update;
 select * into l from public.leads where tenant_id=p_tenant and id=p_lead for update;
 if l.id is null or l.archived_at is not null or not private.lead_allowed(p_tenant,p_lead,'leads.convert') then raise exception 'Lead conversion denied' using errcode='42501';end if;
 if l.status='converted' then return l.customer_id;end if;
 if l.status<>'open' then raise exception 'Reopen lead before conversion';end if;
 select id into stage from public.sales_stages where tenant_id=p_tenant and pipeline_id=l.pipeline_id and is_active and outcome='won' and (p_stage is null or id=p_stage) order by position,id limit 1;
 if stage is null then raise exception 'Active conversion stage required';end if;
 if p_customer is not null then
 select * into c from public.customers where tenant_id=p_tenant and id=p_customer and archived_at is null for update;
 if c.id is null or not private.customer_allowed(p_tenant,c.id,'customers.view') then raise exception 'Customer link denied' using errcode='42501';end if;
 -- Linking does not silently grant a new branch or overwrite shared contact data.
 if not exists(select 1 from public.customer_branches where tenant_id=p_tenant and customer_id=c.id and branch_id=l.branch_id) then raise exception 'Existing customer must include lead branch';end if;
 customer:=c.id;
 else
 if not private.has_permission(p_tenant,'customers.create',l.branch_id) or not private.has_permission(p_tenant,'customers.view',l.branch_id) then raise exception 'Customer creation denied' using errcode='42501';end if;
 select count(*) into matches from public.customer_duplicate_candidates(p_tenant,l.phone,coalesce(l.email,''),l.first_name||' '||l.last_name);
 if matches>0 and p_confirm_duplicate is distinct from true then raise exception 'Possible customer matches. Link a match or confirm separate customer';end if;
 customer:=public.save_customer(p_tenant,null,jsonb_build_object('first_name',l.first_name,'last_name',l.last_name,'phone',l.phone,'additional_phone',l.secondary_phone,'email',l.email),array[l.branch_id]);
 end if;
 update public.leads set status='converted',stage_id=stage,customer_id=customer,converted_at=now(),converted_by=auth.uid(),updated_at=now() where tenant_id=p_tenant and id=p_lead;
 perform private.lead_audit(p_tenant,p_lead,'converted',jsonb_build_object('customer_id',customer,'created_customer',p_customer is null,'source_id',l.source_id,'employee_id',l.assigned_employee_id,'pipeline_id',l.pipeline_id));
 perform private.lead_audit(p_tenant,p_lead,'stage_changed',jsonb_build_object('before',l.stage_id,'after',stage));
 perform private.customer_audit(p_tenant,customer,'lead_converted',jsonb_build_object('lead_id',p_lead));
 return customer;
end $$;
do $$ declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('save_sales_setting','reorder_sales_stages','add_lead_note','save_lead_followup','complete_lead_followup','convert_lead') loop
 execute format('revoke all on function %s from public,anon',f.sig);execute format('grant execute on function %s to authenticated',f.sig);end loop;end $$;
