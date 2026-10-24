-- Preserve invoice issue/void invariants while admitting audited allocation effects.
create or replace function private.assert_invoice_consistent(t uuid,i uuid) returns void language plpgsql security definer set search_path='' as $$
declare h public.invoices;n integer;gross numeric;total numeric;balance numeric;
begin
 select * into h from public.invoices where tenant_id=t and id=i;
 if not found then raise exception 'Invoice is missing';end if;
 select count(*),coalesce(sum(line_total),0) into n,gross from public.invoice_items where tenant_id=t and invoice_id=i;
 total:=gross-h.discount_amount;
 if n not between 1 and 100 or total<0 or total>9999999999999999.99 then raise exception 'Invalid invoice total or item count';end if;
 if not exists(select 1 from public.financial_audit_events where tenant_id=t and invoice_id=i and operation='invoice_created')
 then raise exception 'Invoice creation audit is missing';end if;
 if h.state in ('draft','discarded') then
  if exists(select 1 from public.invoice_receivable_entries where tenant_id=t and invoice_id=i) then raise exception 'Drafts cannot create receivables';end if;
 else
  if total<=0 or not exists(select 1 from public.invoice_receivable_entries e join public.financial_audit_events a on a.tenant_id=e.tenant_id and a.id=e.audit_event_id
   where e.tenant_id=t and e.invoice_id=i and e.kind='issue' and e.amount=total and a.invoice_id=i and a.operation='invoice_issued')
  then raise exception 'Issued invoice requires its exact receivable and audit';end if;
  if h.state='issued' and exists(select 1 from public.invoice_receivable_entries where tenant_id=t and invoice_id=i and kind='void')
  then raise exception 'Only voided invoices may offset issued charges';end if;
  if h.state='voided' and not exists(select 1 from public.invoice_receivable_entries e join public.financial_audit_events a on a.tenant_id=e.tenant_id and a.id=e.audit_event_id
   where e.tenant_id=t and e.invoice_id=i and e.kind='void' and e.amount=-total and a.invoice_id=i and a.operation='invoice_voided')
  then raise exception 'Void requires an exact offset and audit';end if;
 end if;
 select coalesce(sum(amount),0) into balance from public.invoice_receivable_entries where tenant_id=t and invoice_id=i;
 if (h.state='issued' and (balance<0 or balance>total)) or (h.state='voided' and balance<>0) then raise exception 'Invoice allocation balance is inconsistent; release allocations before voiding';end if;
 if exists(select 1 from public.invoice_receivable_entries e where e.tenant_id=t and e.invoice_id=i and e.kind in ('allocation','allocation_release')
 and not exists(select 1 from public.payment_allocations a where a.tenant_id=t and a.id=e.allocation_id and a.invoice_id=i and a.amount=-e.amount and a.audit_event_id=e.audit_event_id))
 then raise exception 'Receivable allocation source is missing';end if;
end $$;
