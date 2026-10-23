create function private.sales_filtered(t uuid,f jsonb) returns setof public.leads language plpgsql stable security definer set search_path='' as $$
declare b uuid;pipeline uuid;stage uuid;source uuid;emp uuid;from_date date;until_date date;q text;tz text;
begin
 if not private.has_permission(t,'tenant.read') then raise exception 'Business access denied' using errcode='42501';end if;
 if jsonb_typeof(f) is distinct from 'object' then raise exception 'Invalid sales filters';end if;
 b:=nullif(f->>'branch','')::uuid;pipeline:=nullif(f->>'pipeline','')::uuid;stage:=nullif(f->>'stage','')::uuid;source:=nullif(f->>'source','')::uuid;
 if coalesce(f->>'employee','') not in ('','unassigned') then emp:=(f->>'employee')::uuid;end if;
 from_date:=nullif(f->>'from','')::date;until_date:=nullif(f->>'until','')::date;q:=trim(coalesce(f->>'q',''));
 if length(q)>100 or from_date>until_date or (nullif(f->>'priority','') is not null and f->>'priority' not in ('low','normal','high','urgent')) then raise exception 'Invalid sales filter range';end if;
 if b is not null and not private.has_permission(t,'leads.view',b) then raise exception 'Sales branch denied' using errcode='42501';end if;
 select timezone into tz from public.tenants where id=t;
 return query select l.* from public.leads l where l.tenant_id=t and private.has_permission(t,'leads.view',l.branch_id)
 and (l.archived_at is not null)=coalesce((f->>'archived')::boolean,false)
 and (b is null or l.branch_id=b) and (pipeline is null or l.pipeline_id=pipeline) and (stage is null or l.stage_id=stage)
 and (source is null or l.source_id=source) and (emp is null or l.assigned_employee_id=emp)
 and (coalesce(f->>'employee','')<>'unassigned' or l.assigned_employee_id is null)
 and (nullif(f->>'priority','') is null or l.priority=f->>'priority')
 and (from_date is null or (l.created_at at time zone tz)::date>=from_date) and (until_date is null or (l.created_at at time zone tz)::date<=until_date)
 and (q='' or position(lower(q) in lower(l.first_name||' '||l.last_name))>0 or position(lower(q) in lower(coalesce(l.email,'')))>0
 or position(q in l.phone)>0 or (length(regexp_replace(q,'[^0-9]','','g'))>=3 and position(regexp_replace(q,'[^0-9]','','g') in l.phone_normalized)>0));
end $$;
create function public.lead_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0,p_board boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid lead page';end if;
 with filtered as materialized(select * from private.sales_filtered(p_tenant,p_filters)),
 ranked as(select l.*,row_number() over(partition by l.stage_id order by l.updated_at desc,l.id) board_rank from filtered l),
 chosen as(select * from ranked where p_board and board_rank<=20 union all
 select * from (select * from ranked where not p_board order by updated_at desc,id limit 20 offset p_page*20) page),
 cards as(select jsonb_build_object('id',l.id,'first_name',l.first_name,'last_name',l.last_name,'phone',l.phone,'priority',l.priority,'branch_id',l.branch_id,
 'pipeline_id',l.pipeline_id,'stage_id',l.stage_id,'status',l.status,'assigned_employee_id',l.assigned_employee_id,'employee_name',e.full_name,
 'next_follow_up',(select min(scheduled_at) from public.lead_followups where tenant_id=p_tenant and lead_id=l.id and completed_at is null),
 'created_at',l.created_at,'archived',l.archived_at is not null) card,l.updated_at from chosen l
 left join public.employees e on e.tenant_id=l.tenant_id and e.id=l.assigned_employee_id)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(card order by updated_at desc,card->>'id') from cards),'[]'),
 'total',(select count(*) from filtered),'stage_counts',coalesce((select jsonb_object_agg(stage_id::text,n) from (select stage_id,count(*) n from filtered group by stage_id) s),'{}')) into result;
 return result;
end $$;
create function public.lead_duplicate_candidates(p_tenant uuid,p_phone text default '',p_email text default '',p_exclude uuid default null)
returns table(id uuid,full_name text,phone text,status text) language sql stable security definer set search_path='' as $$
 select id,first_name||' '||last_name,phone,status from public.leads where tenant_id=p_tenant and (p_exclude is null or id<>p_exclude)
 and private.has_permission(p_tenant,'leads.view',branch_id) and
 ((length(regexp_replace(p_phone,'[^0-9]','','g'))>=3 and phone_normalized=regexp_replace(p_phone,'[^0-9]','','g')) or (nullif(trim(p_email),'') is not null and email=lower(trim(p_email)))) order by created_at desc,id limit 10;
$$;
create function public.sales_followup_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid follow-up page';end if;
 if not private.has_permission(p_tenant,'tenant.read') then raise exception 'Business access denied' using errcode='42501';end if;
 if nullif(p_filters->>'branch','') is not null and not private.has_permission(p_tenant,'leads.view',(p_filters->>'branch')::uuid) then raise exception 'Sales branch denied' using errcode='42501';end if;
 if nullif(p_filters->>'from','')::date>nullif(p_filters->>'until','')::date then raise exception 'Invalid date range';end if;
 with filtered as materialized(select f.*,l.first_name||' '||l.last_name lead_name,l.branch_id,e.full_name employee_name from public.lead_followups f
 join public.leads l on l.tenant_id=f.tenant_id and l.id=f.lead_id join public.tenants t on t.id=l.tenant_id
 join public.employees e on e.tenant_id=f.tenant_id and e.id=f.responsible_employee_id
 where f.tenant_id=p_tenant and l.archived_at is null and private.has_permission(p_tenant,'leads.view',l.branch_id)
 and (nullif(p_filters->>'branch','') is null or l.branch_id=(p_filters->>'branch')::uuid)
 and (nullif(p_filters->>'employee','') is null or f.responsible_employee_id=(p_filters->>'employee')::uuid)
 and (nullif(p_filters->>'from','') is null or (f.scheduled_at at time zone t.timezone)::date>=(p_filters->>'from')::date)
 and (nullif(p_filters->>'until','') is null or (f.scheduled_at at time zone t.timezone)::date<=(p_filters->>'until')::date)
 and (coalesce(p_filters->>'state','pending')='all' or (p_filters->>'state'='completed' and f.completed_at is not null)
 or (coalesce(p_filters->>'state','pending')='pending' and f.completed_at is null) or (p_filters->>'state'='overdue' and f.completed_at is null and f.scheduled_at<now()))),
 page as(select * from filtered order by scheduled_at,id limit 20 offset p_page*20)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by scheduled_at,id) from page p),'[]'),'total',(select count(*) from filtered)) into result;
 return result;
end $$;
create function public.sales_analytics(p_tenant uuid,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.permission_grants(p_tenant) where permission='leads.view_analytics') then raise exception 'Sales analytics denied' using errcode='42501';end if;
 with cohort as materialized(select l.* from private.sales_filtered(p_tenant,p_filters-'archived') l where private.has_permission(p_tenant,'leads.view_analytics',l.branch_id)),
 totals as(select count(*) total,count(*) filter(where status='converted') converted,count(*) filter(where status in ('lost','disqualified')) lost,
 count(*) filter(where status='disqualified') disqualified,
 count(*) filter(where status='open' and stage_id=(select s.id from public.sales_stages s where s.tenant_id=p_tenant and s.pipeline_id=cohort.pipeline_id and s.is_active and s.outcome='open' order by position,id limit 1)) new_leads from cohort)
 select jsonb_build_object('total',total,'converted',converted,'lost',lost,'disqualified',disqualified,'new_leads',new_leads,
 'conversion_rate',case when total=0 then 0 else round(converted::numeric*100/total,2) end,
 'overdue_followups',(select count(*) from public.lead_followups f join cohort l on l.id=f.lead_id and l.tenant_id=f.tenant_id where f.completed_at is null and f.scheduled_at<now()),
 'sources',coalesce((select jsonb_agg(to_jsonb(x)) from (select coalesce(s.name,'Unspecified') label,count(*) count from cohort l left join public.lead_sources s on s.tenant_id=l.tenant_id and s.id=l.source_id group by s.id,s.name order by count(*) desc,s.name) x),'[]'),
 'stages',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.name||' / '||s.name label,count(*) count from cohort l join public.sales_stages s on s.id=l.stage_id and s.tenant_id=l.tenant_id join public.sales_pipelines p on p.id=s.pipeline_id and p.tenant_id=s.tenant_id group by p.name,s.name,s.id order by count(*) desc,s.name) x),'[]'),
 'employees',coalesce((select jsonb_agg(to_jsonb(x)) from (select coalesce(e.full_name,'Unassigned') label,count(*) count from cohort l left join public.employees e on e.id=l.assigned_employee_id and e.tenant_id=l.tenant_id group by e.id,e.full_name order by count(*) desc,e.full_name) x),'[]'),
 'branches',coalesce((select jsonb_agg(to_jsonb(x)) from (select b.name label,count(*) count from cohort l join public.branches b on b.id=l.branch_id and b.tenant_id=l.tenant_id group by b.id,b.name order by count(*) desc,b.name) x),'[]'),
 'trend',coalesce((select jsonb_agg(to_jsonb(x) order by label) from (select (created_at at time zone (select timezone from public.tenants where id=p_tenant))::date label,count(*) count from cohort group by label) x),'[]')) into result from totals;
 return result;
end $$;
revoke all on function private.sales_filtered(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.lead_directory(uuid,jsonb,integer,boolean),public.lead_duplicate_candidates(uuid,text,text,uuid),public.sales_followup_directory(uuid,jsonb,integer),public.sales_analytics(uuid,jsonb) from public,anon;
grant execute on function public.lead_directory(uuid,jsonb,integer,boolean),public.lead_duplicate_candidates(uuid,text,text,uuid),public.sales_followup_directory(uuid,jsonb,integer),public.sales_analytics(uuid,jsonb) to authenticated;
