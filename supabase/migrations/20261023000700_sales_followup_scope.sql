-- A branch move must not strand pending activities with employees who lack
-- sales access to the new branch. Complete/reassign them before moving.
create function private.check_lead_followup_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.branch_id is distinct from old.branch_id and exists(select 1 from public.lead_followups f where f.tenant_id=new.tenant_id and f.lead_id=new.id and f.completed_at is null and not private.lead_employee_eligible(new.tenant_id,f.responsible_employee_id,new.branch_id)) then
 raise exception 'Complete or reassign pending follow-ups before changing branch' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.check_lead_followup_scope() from public,anon,authenticated;
create trigger lead_followup_scope before update of branch_id on public.leads for each row execute function private.check_lead_followup_scope();
