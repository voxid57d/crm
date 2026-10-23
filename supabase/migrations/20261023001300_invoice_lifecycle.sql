create function private.invoice_decimal(value text,quantity boolean default false) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if value is null or (not quantity and value !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$')
 or (quantity and value !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,4})?$') then raise exception 'Invalid invoice decimal precision';end if;
 n:=value::numeric;
 if quantity then if n<=0 then raise exception 'Quantity must be positive';end if;return n::numeric(10,4);end if;
 return n::numeric(18,2);
end $$;
create function private.normalized_invoice(data jsonb,items jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb;normalized jsonb:='[]';qty numeric;price numeric;discount numeric;subtotal numeric:=0;header_discount numeric;description text;
begin
 if jsonb_typeof(data) is distinct from 'object' or jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid invoice data';end if;
 if jsonb_array_length(items) not between 1 and 100 then raise exception 'Use between 1 and 100 invoice lines';end if;
 if coalesce(data->>'issue_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(data->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or (data->>'due_date')::date<(data->>'issue_date')::date or length(coalesce(data->>'notes',''))>2000
 or coalesce(data->>'currency','UZS')<>'UZS' then raise exception 'Invalid invoice dates, notes or currency';end if;
 if jsonb_typeof(data->'discount_amount') is distinct from 'string' then raise exception 'Money must be decimal text';end if;
 header_discount:=private.invoice_decimal(data->>'discount_amount');
 for item in select value from jsonb_array_elements(items) loop
  description:=trim(item->>'description');
  if description is null or length(description) not between 1 and 500 then raise exception 'Each line needs a description';end if;
  if jsonb_typeof(item->'quantity') is distinct from 'string' or jsonb_typeof(item->'unit_price') is distinct from 'string'
  or jsonb_typeof(item->'discount_amount') is distinct from 'string' then raise exception 'Money and quantity must be decimal text';end if;
  qty:=private.invoice_decimal(item->>'quantity',true);price:=private.invoice_decimal(item->>'unit_price');discount:=private.invoice_decimal(item->>'discount_amount');
  if round(qty*price,2)>9999999999999999.99 or discount>round(qty*price,2) then raise exception 'Invalid line total or discount';end if;
  subtotal:=subtotal+round(qty*price,2)-discount;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('description',description,'quantity',qty::text,'unit_price',price::text,'discount_amount',discount::text));
 end loop;
 if subtotal<header_discount or subtotal-header_discount>9999999999999999.99 then raise exception 'Invalid invoice total or discount';end if;
 return jsonb_build_object('branch_id',(data->>'branch_id')::uuid,'customer_id',(data->>'customer_id')::uuid,'currency','UZS',
 'issue_date',(data->>'issue_date')::date,'due_date',(data->>'due_date')::date,'discount_amount',header_discount::text,'notes',coalesce(data->>'notes',''),
 'replaces_invoice_id',nullif(data->>'replaces_invoice_id','')::uuid,'items',normalized);
end $$;
create function private.invoice_content(t uuid,i uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select (to_jsonb(h)-'discount_amount')||jsonb_build_object('discount_amount',round(h.discount_amount,2)::text,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position,'description',description,'quantity',quantity::text,
 'unit_price',round(unit_price,2)::text,'discount_amount',round(discount_amount,2)::text,'line_total',round(line_total,2)::text) order by position)
 from public.invoice_items where tenant_id=t and invoice_id=i),'[]')) from public.invoices h where h.tenant_id=t and h.id=i;
$$;
create function private.invoice_audit(t uuid,i uuid,op text,k uuid,payload jsonb,reason text,before_data jsonb,after_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 insert into public.financial_audit_events(tenant_id,invoice_id,operation,actor_id,actor_name,request_key,request_payload,reason,before_data,after_data)
 values(t,i,op,auth.uid(),coalesce(private.finance_actor_name(),'Business member'),k,payload,reason,before_data,after_data) returning id into result;
 return result;
end $$;
create function private.invoice_replay(t uuid,k uuid,payload jsonb,permission text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.financial_audit_events;
begin
 if auth.uid() is null or k is null or not private.has_permission(t,'tenant.read') then raise exception using errcode='42501',message='Invoice command denied';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':invoice:'||k::text,0));
 -- Match the existing tenant -> customer -> document order used by CRM edits.
 perform 1 from public.tenants where id=t for update;
 select * into a from public.financial_audit_events where tenant_id=t and request_key=k;
 if found then
  if a.actor_id<>auth.uid() or a.request_payload<>payload or not private.invoice_allowed(t,a.invoice_id,permission)
  then raise exception using errcode='42501',message='Invoice request identifier already used or access changed';end if;
  return a.invoice_id;
 end if;
 return null;
end $$;
create function public.save_invoice_draft(p_tenant uuid,p_invoice uuid,p_request uuid,p_version integer,p_data jsonb,p_items jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare normalized jsonb;payload jsonb;h public.invoices;replay uuid;customer public.customers;business public.tenants;branch public.branches;
 replacement public.invoices;before_data jsonb;item jsonb;line integer:=0;identifier uuid;bill jsonb;v_issuer jsonb;
begin
 normalized:=private.normalized_invoice(p_data,p_items);
 payload:=jsonb_build_object('operation','save','invoice_id',p_invoice,'version',p_version,'data',normalized);
 replay:=private.invoice_replay(p_tenant,p_request,payload,'invoices.create');if replay is not null then return replay;end if;
 if not private.has_permission(p_tenant,'invoices.view',(normalized->>'branch_id')::uuid)
 or not private.has_permission(p_tenant,'invoices.create',(normalized->>'branch_id')::uuid)
 then raise exception using errcode='42501',message='Invoice draft management denied';end if;
 select * into customer from public.customers where tenant_id=p_tenant and id=(normalized->>'customer_id')::uuid for update;
 if not found or customer.archived_at is not null or not private.customer_allowed(p_tenant,customer.id,'customers.view')
 or not exists(select 1 from public.customer_branches where tenant_id=p_tenant and customer_id=customer.id and branch_id=(normalized->>'branch_id')::uuid)
 then raise exception using errcode='42501',message='Choose an active authorized customer in the invoice branch';end if;
 select * into branch from public.branches where tenant_id=p_tenant and id=(normalized->>'branch_id')::uuid for share;
 if not found or not branch.is_active then raise exception 'Choose an active authorized branch';end if;
 select * into business from public.tenants where id=p_tenant;
 bill:=jsonb_build_object('name',trim(customer.first_name||' '||customer.last_name),'phone',customer.phone,'email',customer.email,'address',customer.address);
 v_issuer:=jsonb_build_object('name',business.name,'email',business.contact_email,'phone',business.phone,'address',business.address);
 if normalized->>'replaces_invoice_id' is not null then
  select * into replacement from public.invoices where tenant_id=p_tenant and id=(normalized->>'replaces_invoice_id')::uuid;
  if not found or replacement.state<>'voided' or replacement.branch_id<>branch.id or replacement.customer_id<>customer.id
  or not private.invoice_allowed(p_tenant,replacement.id) then raise exception 'Replacement must reference an authorized voided invoice for the same customer and branch';end if;
 end if;
 if p_invoice is null then
  if p_version is distinct from 0 then raise exception 'Invalid new invoice version';end if;
  insert into public.invoices(tenant_id,branch_id,customer_id,issue_date,due_date,discount_amount,notes,bill_to,issuer,branch_name,replaces_invoice_id,created_by)
  values(p_tenant,branch.id,customer.id,(normalized->>'issue_date')::date,(normalized->>'due_date')::date,(normalized->>'discount_amount')::numeric,
  normalized->>'notes',bill,v_issuer,branch.name,replacement.id,auth.uid()) returning * into h;
 else
  select * into h from public.invoices where tenant_id=p_tenant and id=p_invoice for update;
  if not found or not private.invoice_allowed(p_tenant,p_invoice,'invoices.create') then raise exception using errcode='42501',message='Invoice draft management denied';end if;
  if h.state<>'draft' then raise exception 'Only drafts can be edited';end if;
  if h.version is distinct from p_version then raise exception using errcode='40001',message='Invoice changed; reload before saving';end if;
  before_data:=private.invoice_content(p_tenant,h.id);
  update public.invoices set branch_id=branch.id,customer_id=customer.id,issue_date=(normalized->>'issue_date')::date,due_date=(normalized->>'due_date')::date,
  discount_amount=(normalized->>'discount_amount')::numeric,notes=normalized->>'notes',bill_to=bill,issuer=v_issuer,branch_name=branch.name,
  replaces_invoice_id=replacement.id,version=version+1,updated_at=now() where id=h.id;
  delete from public.invoice_items where tenant_id=p_tenant and invoice_id=h.id;
 end if;
 for item in select value from jsonb_array_elements(normalized->'items') loop
  line:=line+1;
  insert into public.invoice_items(tenant_id,invoice_id,position,description,quantity,unit_price,discount_amount)
  values(p_tenant,h.id,line,item->>'description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'discount_amount')::numeric);
 end loop;
 identifier:=private.invoice_audit(p_tenant,h.id,case when p_invoice is null then 'invoice_created' else 'invoice_updated' end,p_request,payload,'',before_data,private.invoice_content(p_tenant,h.id));
 return h.id;
end $$;

create function public.transition_invoice(p_tenant uuid,p_invoice uuid,p_request uuid,p_version integer,p_action text,p_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb;replay uuid;permission text;h public.invoices;customer public.customers;business public.tenants;branch public.branches;
 total numeric;number bigint;event uuid;before_data jsonb;
begin
 if p_action is null or p_action not in ('issue','void','discard') or p_reason is null then raise exception 'Invalid invoice transition';end if;
 if p_action in ('void','discard') and length(trim(p_reason)) not between 3 and 1000 then raise exception 'A correction/discard reason is required';end if;
 if length(p_reason)>1000 then raise exception 'Reason is too long';end if;
 permission:=case p_action when 'issue' then 'invoices.issue' when 'void' then 'invoices.void' else 'invoices.create' end;
 payload:=jsonb_build_object('operation',p_action,'invoice_id',p_invoice,'version',p_version,'reason',trim(p_reason));
 replay:=private.invoice_replay(p_tenant,p_request,payload,permission);if replay is not null then return replay;end if;
 if not private.invoice_allowed(p_tenant,p_invoice,permission) then raise exception using errcode='42501',message='Invoice transition denied';end if;
 select * into h from public.invoices where tenant_id=p_tenant and id=p_invoice;
 -- Issue locks the CRM source before locking its invoice, avoiding an edit/issue inversion.
 if p_action='issue' then
  select * into customer from public.customers where tenant_id=p_tenant and id=h.customer_id for update;
 end if;
 select * into h from public.invoices where tenant_id=p_tenant and id=p_invoice for update;
 if h.version is distinct from p_version then raise exception using errcode='40001',message='Invoice changed; reload before saving';end if;
 before_data:=private.invoice_content(p_tenant,h.id);
 select coalesce(sum(line_total),0)-h.discount_amount into total from public.invoice_items where tenant_id=p_tenant and invoice_id=h.id;
 if p_action='issue' then
  if h.state<>'draft' then raise exception 'Only draft invoices can be issued';end if;
  if customer.archived_at is not null or not private.customer_allowed(p_tenant,h.customer_id,'customers.view')
  or not exists(select 1 from public.customer_branches where tenant_id=p_tenant and customer_id=h.customer_id and branch_id=h.branch_id)
  then raise exception using errcode='42501',message='Choose an active authorized customer in the invoice branch';end if;
  select * into branch from public.branches where tenant_id=p_tenant and id=h.branch_id for share;
  if not branch.is_active then raise exception 'Cannot issue for an inactive branch';end if;
  select * into business from public.tenants where id=p_tenant;
  if h.issue_date>(now() at time zone business.timezone)::date then raise exception 'Issue date cannot be in the future';end if;
  if total<=0 then raise exception 'Issued invoices must have a positive total';end if;
  insert into public.invoice_number_counters values(p_tenant,1) on conflict(tenant_id) do update set last_number=public.invoice_number_counters.last_number+1 returning last_number into number;
  update public.invoices set state='issued',invoice_number='INV-'||lpad(number::text,greatest(6,length(number::text)),'0'),issued_at=now(),issued_by=auth.uid(),
  bill_to=jsonb_build_object('name',trim(customer.first_name||' '||customer.last_name),'phone',customer.phone,'email',customer.email,'address',customer.address),
  issuer=jsonb_build_object('name',business.name,'email',business.contact_email,'phone',business.phone,'address',business.address),branch_name=branch.name,
  version=version+1,updated_at=now() where id=h.id;
 elsif p_action='void' then
  if h.state<>'issued' then raise exception 'Only issued invoices can be voided';end if;
  update public.invoices set state='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),version=version+1,updated_at=now() where id=h.id;
 else
  if h.state<>'draft' then raise exception 'Only draft invoices can be discarded';end if;
  update public.invoices set state='discarded',discarded_at=now(),version=version+1,updated_at=now() where id=h.id;
 end if;
 event:=private.invoice_audit(p_tenant,h.id,'invoice_'||case p_action when 'issue' then 'issued' when 'void' then 'voided' else 'discarded' end,
 p_request,payload,trim(p_reason),before_data,private.invoice_content(p_tenant,h.id));
 if p_action in ('issue','void') then
  insert into public.invoice_receivable_entries(tenant_id,invoice_id,currency,kind,amount,audit_event_id)
  values(p_tenant,h.id,h.currency,p_action,case p_action when 'issue' then total else -total end,event);
 end if;
 return h.id;
end $$;
revoke all on function private.invoice_decimal(text,boolean),private.normalized_invoice(jsonb,jsonb),private.invoice_content(uuid,uuid),private.invoice_audit(uuid,uuid,text,uuid,jsonb,text,jsonb,jsonb),private.invoice_replay(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.save_invoice_draft(uuid,uuid,uuid,integer,jsonb,jsonb),public.transition_invoice(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.save_invoice_draft(uuid,uuid,uuid,integer,jsonb,jsonb),public.transition_invoice(uuid,uuid,uuid,integer,text,text) to authenticated;
