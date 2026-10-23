create function private.finance_amount(value text) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if value is null or value !~ '^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' then
 raise exception 'Use a decimal amount with at most 16 integer digits and 2 fractional digits';end if;
 n:=value::numeric;
 if n=0 then raise exception 'Amount must be nonzero';end if;
 return n::numeric(18,2);
end $$;
create function private.finance_actor_name() returns text language sql stable security definer set search_path='' as $$
 select coalesce(nullif(trim(full_name),''),'Business member') from public.profiles where id=auth.uid();
$$;
revoke all on function private.finance_amount(text),private.finance_actor_name() from public,anon,authenticated;

create function public.save_cashbox(p_tenant uuid,p_id uuid,p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;old_data jsonb;payload jsonb;branch uuid;active boolean;box_name text;box_type text;box_currency text;actor text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Cashbox management denied';end if;
 branch:=nullif(p_data->>'branch_id','')::uuid;
 box_name:=trim(p_data->>'name');box_type:=p_data->>'cashbox_type';box_currency:=coalesce(p_data->>'currency','UZS');
 if box_name is null or length(box_name) not between 1 and 100 or box_type is null or box_type not in ('cash','bank','other')
 or box_currency<>'UZS' or (p_data ? 'is_active' and jsonb_typeof(p_data->'is_active')<>'boolean') then raise exception 'Invalid cashbox details';end if;
 active:=coalesce((p_data->>'is_active')::boolean,true);
 actor:=coalesce(private.finance_actor_name(),'Business member');
 payload:=jsonb_build_object('branch_id',branch,'name',box_name,'cashbox_type',box_type,'currency',box_currency,'is_active',active);
 if p_id is null then
  if not private.has_permission(p_tenant,'cashboxes.view',branch) or not private.has_permission(p_tenant,'cashboxes.manage',branch)
  then raise exception using errcode='42501',message='Cashbox management denied';end if;
  if p_request is null then raise exception 'A request identifier is required';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':cashbox:'||p_request::text,0));
  select * into b from public.cashboxes where tenant_id=p_tenant and creation_key=p_request;
  if found then
   if b.creation_payload<>payload or b.created_by<>auth.uid() or not private.cashbox_allowed(p_tenant,b.id,'cashboxes.manage')
   then raise exception 'Request identifier already used for different cashbox details';end if;
   return b.id;
  end if;
  if branch is not null and not exists(select 1 from public.branches where tenant_id=p_tenant and id=branch and is_active)
  then raise exception 'Choose an active authorized branch';end if;
  insert into public.cashboxes(tenant_id,branch_id,name,cashbox_type,currency,is_active,created_by,creation_key,creation_payload)
  values(p_tenant,branch,box_name,box_type,box_currency,active,auth.uid(),p_request,payload) returning * into b;
  insert into public.financial_audit_events(tenant_id,cashbox_id,operation,actor_id,actor_name,after_data)
  values(p_tenant,b.id,'cashbox_created',auth.uid(),actor,payload);
 else
  select * into b from public.cashboxes where tenant_id=p_tenant and id=p_id for update;
  if not found or not private.cashbox_allowed(p_tenant,p_id,'cashboxes.manage') then raise exception using errcode='42501',message='Cashbox management denied';end if;
  if (branch,box_currency) is distinct from (b.branch_id,b.currency) then raise exception 'Cashbox branch and currency cannot change';end if;
  if (p_data->>'version') is null or (p_data->>'version')!~'^[0-9]{1,9}$' or (p_data->>'version')::integer<>b.version
  then raise exception using errcode='40001',message='Cashbox changed; reload before saving';end if;
  old_data:=jsonb_build_object('branch_id',b.branch_id,'name',b.name,'cashbox_type',b.cashbox_type,'currency',b.currency,'is_active',b.is_active);
  if old_data=payload then return b.id;end if;
  update public.cashboxes set name=box_name,cashbox_type=box_type,is_active=active,version=version+1,updated_at=now() where id=b.id;
  insert into public.financial_audit_events(tenant_id,cashbox_id,operation,actor_id,actor_name,before_data,after_data)
  values(p_tenant,b.id,'cashbox_updated',auth.uid(),actor,old_data,payload);
 end if;
 return b.id;
end $$;

create function public.post_cashbox_entry(p_tenant uuid,p_cashbox uuid,p_request uuid,p_kind text,p_amount text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.cashboxes;x public.financial_transactions;n numeric;payload jsonb;actor text;employee uuid;
begin
 if not private.cashbox_allowed(p_tenant,p_cashbox,'cashboxes.adjust') then raise exception using errcode='42501',message='Cashbox adjustment denied';end if;
 if p_request is null or p_kind is null or p_kind not in ('opening_balance','adjustment') or p_reason is null or length(trim(p_reason)) not between 3 and 1000
 then raise exception 'A request identifier, supported posting type and reason are required';end if;
 n:=private.finance_amount(p_amount);
 if p_kind='opening_balance' and n<0 then raise exception 'Opening balance must be positive';end if;
 payload:=jsonb_build_object('cashbox_id',p_cashbox,'kind',p_kind,'amount',n::text,'reason',trim(p_reason));
 -- Same lock order for every posting: request key, then cashbox. The unique
 -- constraint remains the final defense against duplicate committed requests.
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':posting:'||p_request::text,0));
 select * into x from public.financial_transactions where tenant_id=p_tenant and idempotency_key=p_request;
 if found then
  if x.request_payload<>payload or x.actor_id<>auth.uid() then raise exception 'Request identifier already used for different posting details';end if;
  return x.id;
 end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=p_cashbox for update;
 if not found or not private.cashbox_allowed(p_tenant,p_cashbox,'cashboxes.adjust') then raise exception using errcode='42501',message='Cashbox adjustment denied';end if;
 if not b.is_active then raise exception 'Posting requires an active cashbox and branch';end if;
 actor:=coalesce(private.finance_actor_name(),'Business member');
 select id into employee from public.employees where tenant_id=p_tenant and user_id=auth.uid() and status='active';
 insert into public.financial_transactions(tenant_id,kind,currency,idempotency_key,request_payload,reason,actor_id,actor_name,employee_id)
 values(p_tenant,p_kind,b.currency,p_request,payload,trim(p_reason),auth.uid(),actor,employee) returning * into x;
 insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values(p_tenant,x.id,b.id,p_kind,b.currency,n);
 insert into public.financial_audit_events(tenant_id,cashbox_id,transaction_id,operation,actor_id,actor_name,reason,after_data)
 values(p_tenant,b.id,x.id,p_kind,auth.uid(),actor,trim(p_reason),jsonb_build_object('amount',n::text,'currency',b.currency));
 return x.id;
end $$;

create function public.cashbox_directory(p_tenant uuid,p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;branch uuid;scope text:=coalesce(p_filters->>'branch','');status text:=coalesce(p_filters->>'status','all');sorting text:=coalesce(p_filters->>'sort','name');
begin
 if not private.has_permission(p_tenant,'tenant.read') then raise exception using errcode='42501',message='Financial access denied';end if;
 if p_page is null or p_page not between 0 and 100000 or status not in ('all','active','inactive') or sorting not in ('name','balance','newest')
 or coalesce(p_filters->>'type','') not in ('','cash','bank','other') or length(coalesce(p_filters->>'q',''))>100 then raise exception 'Invalid cashbox filters';end if;
 if scope not in ('','business') then branch:=scope::uuid;
  if not private.has_permission(p_tenant,'cashboxes.view',branch) then raise exception using errcode='42501',message='Financial access denied';end if;
 elsif scope='business' and not private.has_permission(p_tenant,'cashboxes.view') then raise exception using errcode='42501',message='Financial access denied';end if;
 with filtered as materialized (
  select b.id,b.branch_id,b.name,b.cashbox_type,b.currency,b.is_active,b.version,b.created_at,br.name branch_name,
  coalesce((select sum(e.amount) from public.financial_ledger_entries e where e.tenant_id=b.tenant_id and e.cashbox_id=b.id),0) balance
  from public.cashboxes b left join public.branches br on br.tenant_id=b.tenant_id and br.id=b.branch_id
  where b.tenant_id=p_tenant and private.cashbox_allowed(p_tenant,b.id)
  and (scope='' or (scope='business' and b.branch_id is null) or b.branch_id=branch)
  and (status='all' or b.is_active=(status='active')) and (coalesce(p_filters->>'type','')='' or b.cashbox_type=p_filters->>'type')
  and position(lower(coalesce(p_filters->>'q','')) in lower(b.name))>0
 ), page as (
  select *,row_number() over(order by case when sorting='balance' then balance end desc,case when sorting='newest' then created_at end desc,name,id) rank
  from filtered order by rank limit 20 offset p_page*20
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(
  (to_jsonb(page)-'rank'-'balance')||jsonb_build_object('balance',round(balance,2)::text) order by rank) from page),'[]')) into result;
 return result;
end $$;

create function public.cashbox_details(p_tenant uuid,p_cashbox uuid,p_filters jsonb default '{}',p_page integer default 0,p_audit_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;b public.cashboxes;zone text;date_from date;date_to date;filter_kind text:=coalesce(p_filters->>'kind','');actor uuid;
begin
 if not private.cashbox_allowed(p_tenant,p_cashbox) then raise exception using errcode='42501',message='Cashbox access denied';end if;
 if p_page is null or p_audit_page is null or p_page not between 0 and 100000 or p_audit_page not between 0 and 100000
 or filter_kind not in ('','opening_balance','adjustment') then raise exception 'Invalid ledger filters';end if;
 select * into b from public.cashboxes where tenant_id=p_tenant and id=p_cashbox;
 select timezone into zone from public.tenants where id=p_tenant;
 date_from:=nullif(p_filters->>'from','')::date;date_to:=nullif(p_filters->>'to','')::date;
 if date_from>date_to then raise exception 'Date range is reversed';end if;
 actor:=nullif(p_filters->>'actor','')::uuid;
 with entries as materialized (
  select e.id,e.amount,e.currency,x.id transaction_id,x.kind,x.reason,x.actor_id,x.actor_name,x.employee_id,x.posted_at
  from public.financial_ledger_entries e join public.financial_transactions x on x.tenant_id=e.tenant_id and x.id=e.transaction_id
  where e.tenant_id=p_tenant and e.cashbox_id=p_cashbox
 ), filtered as materialized (
  select * from entries where (filter_kind='' or entries.kind=filter_kind) and (actor is null or actor_id=actor)
  and (date_from is null or posted_at>=date_from::timestamp at time zone zone)
  and (date_to is null or posted_at<(date_to+1)::timestamp at time zone zone)
 ), page as(select * from filtered order by posted_at desc,transaction_id desc limit 20 offset p_page*20),
 audits as materialized(select * from public.financial_audit_events a where a.tenant_id=p_tenant and a.cashbox_id=p_cashbox
 and private.cashbox_allowed(p_tenant,p_cashbox,'finance.audit.view'))
 select jsonb_build_object('cashbox',to_jsonb(b)-'creation_payload'-'creation_key',
 'branch_name',(select name from public.branches where tenant_id=p_tenant and id=b.branch_id),
 'balance',(select round(coalesce(sum(amount),0),2)::text from entries),
 'has_entries',exists(select 1 from entries),'total',(select count(*) from filtered),
 'rows',coalesce((select jsonb_agg((to_jsonb(page)-'amount')||jsonb_build_object('amount',round(amount,2)::text) order by posted_at desc,transaction_id desc) from page),'[]'),
 'actors',coalesce((select jsonb_agg(to_jsonb(a) order by a.name,a.id) from (select distinct on(actor_id) actor_id id,actor_name name from entries order by actor_id,posted_at desc,transaction_id desc limit 200) a),'[]'),
 'audit_total',(select count(*) from audits),'audit',coalesce((select jsonb_agg(to_jsonb(a) order by created_at desc,id desc)
 from(select id,operation,actor_name,reason,before_data,after_data,created_at from audits order by created_at desc,id desc limit 20 offset p_audit_page*20) a),'[]')) into result;
 return result;
end $$;
revoke all on function public.save_cashbox(uuid,uuid,uuid,jsonb),public.post_cashbox_entry(uuid,uuid,uuid,text,text,text),public.cashbox_directory(uuid,jsonb,integer),public.cashbox_details(uuid,uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.save_cashbox(uuid,uuid,uuid,jsonb),public.post_cashbox_entry(uuid,uuid,uuid,text,text,text),public.cashbox_directory(uuid,jsonb,integer),public.cashbox_details(uuid,uuid,jsonb,integer,integer) to authenticated;
