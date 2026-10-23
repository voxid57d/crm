-- Correct routine volatility for date/JSON conversion and make audit creation explicit.
-- No existing documents or financial records change.
create or replace function private.normalized_invoice(data jsonb,items jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare item jsonb;normalized jsonb:='[]'::jsonb;qty numeric;price numeric;discount numeric;subtotal numeric:=0;header_discount numeric;description text;
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

create or replace function public.save_invoice_draft(p_tenant uuid,p_invoice uuid,p_request uuid,p_version integer,p_data jsonb,p_items jsonb) returns uuid
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
 if identifier is null then raise exception 'Invoice audit was not created';end if;
 return h.id;
end $$;
