create function private.group_schedule_closure_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','cancelled','archived') and exists(select 1 from public.group_schedule_slots where tenant_id=new.tenant_id and group_id=new.id and is_active and effective_to>=(now() at time zone timezone)::date) then raise exception 'End current/future weekly schedule periods before closing the group';end if;return new;
end $$;
create trigger group_schedule_closure_guard before update on public.study_groups for each row execute function private.group_schedule_closure_guard();
revoke all on function private.group_schedule_closure_guard() from public,anon,authenticated;
