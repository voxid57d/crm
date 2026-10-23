create index lead_followups_lead_idx on public.lead_followups(tenant_id,lead_id,scheduled_at,id);
-- Full outcome metadata is either present as a group or absent as a group.
alter table public.leads add constraint lead_conversion_integrity check (
 (status='converted' and customer_id is not null and converted_at is not null and converted_by is not null) or
 (status<>'converted' and customer_id is null and converted_at is null and converted_by is null));
alter table public.leads add constraint lead_loss_integrity check (
 (status in ('lost','disqualified') and loss_reason_id is not null and lost_at is not null and lost_by is not null) or
 (status not in ('lost','disqualified') and loss_reason_id is null and lost_at is null and lost_by is null));
