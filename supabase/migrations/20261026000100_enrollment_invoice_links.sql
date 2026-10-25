-- 7D: a retained source link, using the existing invoice service and ledger.
alter table public.invoices add constraint invoices_academic_identity unique(tenant_id,id,customer_id,branch_id);
alter table public.student_enrollments add constraint enrollments_billing_identity unique(tenant_id,id,customer_id,branch_id);
create table public.enrollment_invoice_links (
 tenant_id uuid not null,enrollment_id uuid not null,invoice_id uuid not null,customer_id uuid not null,branch_id uuid not null,
 request_id uuid not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(tenant_id,invoice_id),unique(tenant_id,request_id),
 foreign key(tenant_id,enrollment_id,customer_id,branch_id) references public.student_enrollments(tenant_id,id,customer_id,branch_id),
 foreign key(tenant_id,invoice_id,customer_id,branch_id) references public.invoices(tenant_id,id,customer_id,branch_id)
);
create index enrollment_invoice_source on public.enrollment_invoice_links(tenant_id,enrollment_id,created_at desc,invoice_id);
alter table public.enrollment_invoice_links enable row level security;
revoke all on public.enrollment_invoice_links from public,anon,authenticated;
grant select on public.enrollment_invoice_links to authenticated;
create policy enrollment_invoice_read on public.enrollment_invoice_links for select to authenticated using (
 private.enrollment_allowed(tenant_id,enrollment_id) and private.invoice_allowed(tenant_id,invoice_id)
);
create function private.retain_enrollment_invoice_link() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Enrollment invoice source links are retained and immutable';end $$;
create trigger retain_enrollment_invoice_link before update or delete on public.enrollment_invoice_links for each row execute function private.retain_enrollment_invoice_link();
revoke all on function private.retain_enrollment_invoice_link() from public,anon,authenticated;

create function public.create_enrollment_invoice_draft(p_tenant uuid,p_enrollment uuid,p_request uuid,p_version integer,p_issue_date text,p_due_date text,p_description text) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.student_enrollments;payload jsonb;replay uuid;result uuid;
begin
 payload:=jsonb_build_object('command','enrollment_invoice','enrollment',p_enrollment,'version',p_version,'issue_date',p_issue_date,'due_date',p_due_date,'description',p_description);
 replay:=private.lms_request(p_tenant,p_request,payload);
 if not private.enrollment_allowed(p_tenant,p_enrollment) or not private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.view_pricing') then raise exception using errcode='42501',message='Enrollment billing denied';end if;
 select * into e from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment for update;
 if not private.has_permission(p_tenant,'invoices.view',e.branch_id) or not private.has_permission(p_tenant,'invoices.create',e.branch_id) or not private.customer_allowed(p_tenant,e.customer_id,'customers.view') then raise exception using errcode='42501',message='Financial draft creation denied';end if;
 if replay is not null then
  if not exists(select 1 from public.enrollment_invoice_links where tenant_id=p_tenant and invoice_id=replay and enrollment_id=p_enrollment and request_id=p_request) or not private.invoice_allowed(p_tenant,replay,'invoices.create') then raise exception using errcode='42501',message='Invoice replay access changed';end if;
  return replay;
 end if;
 if e.version is distinct from p_version then raise exception using errcode='40001',message='Enrollment changed; reload before billing';end if;
 if e.status='cancelled' or p_description is null or length(trim(p_description)) not between 1 and 500 then raise exception 'Choose a non-cancelled enrollment and describe this charge';end if;
 -- Exactly one agreed unit. Monthly/per-lesson agreements are templates, never inferred periods or automatic billing.
 result:=public.save_invoice_draft(p_tenant,null,p_request,0,jsonb_build_object('branch_id',e.branch_id,'customer_id',e.customer_id,'currency',e.currency,
  'issue_date',p_issue_date,'due_date',p_due_date,'discount_amount','0','notes','','replaces_invoice_id',null),
  jsonb_build_array(jsonb_build_object('description',trim(p_description),'quantity','1','unit_price',round(e.agreed_price,2)::text,'discount_amount','0')));
 insert into public.enrollment_invoice_links(tenant_id,enrollment_id,invoice_id,customer_id,branch_id,request_id,created_by)
 values(p_tenant,e.id,result,e.customer_id,e.branch_id,p_request,auth.uid());
 perform private.lms_finish(p_tenant,p_request,payload,result);
 return result;
end $$;

create function public.enrollment_billing_details(p_tenant uuid,p_enrollment uuid,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.student_enrollments;result jsonb;
begin
 if not private.enrollment_allowed(p_tenant,p_enrollment) then raise exception using errcode='42501',message='Enrollment access denied';end if;
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid invoice page';end if;
 select * into e from public.student_enrollments where tenant_id=p_tenant and id=p_enrollment;
 with rows as materialized(select i.id,i.invoice_number,i.state,i.issue_date,i.due_date,i.currency,
  (select round(coalesce(sum(line_total),0)-i.discount_amount,2)::text from public.invoice_items where tenant_id=p_tenant and invoice_id=i.id) total,i.created_at
  from public.enrollment_invoice_links l join public.invoices i on i.tenant_id=p_tenant and i.id=l.invoice_id
  where l.tenant_id=p_tenant and l.enrollment_id=p_enrollment and private.invoice_allowed(p_tenant,i.id)),
 page as(select * from rows order by created_at desc,id limit 20 offset p_page*20)
 select jsonb_build_object('can_view',private.has_permission(p_tenant,'invoices.view',e.branch_id),'can_create',e.status<>'cancelled'
  and private.enrollment_allowed(p_tenant,p_enrollment,'enrollments.view_pricing') and private.has_permission(p_tenant,'invoices.view',e.branch_id)
  and private.has_permission(p_tenant,'invoices.create',e.branch_id) and private.customer_allowed(p_tenant,e.customer_id,'customers.view')
  and exists(select 1 from public.customers where tenant_id=p_tenant and id=e.customer_id and archived_at is null)
  and exists(select 1 from public.branches where tenant_id=p_tenant and id=e.branch_id and is_active),
  'total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]')) into result;
 return result;
end $$;

create function public.invoice_enrollment_source(p_tenant uuid,p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.invoice_allowed(p_tenant,p_invoice) then raise exception using errcode='42501',message='Invoice access denied';end if;
 return (select jsonb_build_object('enrollment_id',l.enrollment_id,'group_name',g.name) from public.enrollment_invoice_links l
 join public.student_enrollments e on e.tenant_id=p_tenant and e.id=l.enrollment_id join public.study_groups g on g.tenant_id=p_tenant and g.id=e.group_id
 where l.tenant_id=p_tenant and l.invoice_id=p_invoice and private.enrollment_allowed(p_tenant,e.id));
end $$;
revoke all on function public.create_enrollment_invoice_draft(uuid,uuid,uuid,integer,text,text,text),public.enrollment_billing_details(uuid,uuid,integer),public.invoice_enrollment_source(uuid,uuid) from public,anon;
grant execute on function public.create_enrollment_invoice_draft(uuid,uuid,uuid,integer,text,text,text),public.enrollment_billing_details(uuid,uuid,integer),public.invoice_enrollment_source(uuid,uuid) to authenticated;
