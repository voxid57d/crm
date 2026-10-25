-- 8B: retained non-teaching dates and individual weekly occurrence exceptions.
insert into public.permissions(key,description) values('schedules.manage_holidays','Manage non-teaching dates in the actual business or branch scope');
create function private.seed_closure_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_role_permissions(tenant_id,role_id,permission) select tenant_id,id,'schedules.manage_holidays' from public.business_roles
 where tenant_id=new.id and system_key in ('owner','admin','manager') on conflict do nothing;return new;
end $$;
create trigger zzzzzzzzzzzz_seed_closures after insert on public.tenants for each row execute function private.seed_closure_permissions();
insert into public.business_role_permissions(tenant_id,role_id,permission) select tenant_id,id,'schedules.manage_holidays' from public.business_roles where system_key in ('owner','admin','manager') on conflict do nothing;
revoke all on function private.seed_closure_permissions() from public,anon,authenticated;

create table public.academic_closures (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),branch_id uuid,
 name text not null check(length(trim(name)) between 1 and 150),reason text not null check(length(trim(reason)) between 3 and 1000),
 from_date date not null,to_date date not null,timezone text not null,is_active boolean not null default true,version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),foreign key(tenant_id,branch_id) references public.branches(tenant_id,id),check(to_date>=from_date and to_date-from_date<=365)
);
create index academic_closures_dates on public.academic_closures(tenant_id,branch_id,from_date,to_date) where is_active;
create table public.group_schedule_exceptions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,branch_id uuid not null,series_id uuid not null,
 occurrence_date date not null,is_active boolean not null default true,reason text not null check(length(trim(reason)) between 3 and 1000),
 version integer not null default 1 check(version>0),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,series_id,occurrence_date),
 foreign key(tenant_id,series_id,group_id,branch_id) references public.group_schedule_series(tenant_id,id,group_id,branch_id)
);
create table public.academic_calendar_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,closure_id uuid,exception_id uuid,
 operation text not null,actor_id uuid not null references auth.users(id),actor_name text not null,reason text not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now(),
 check(num_nonnulls(closure_id,exception_id)=1),foreign key(tenant_id,closure_id) references public.academic_closures(tenant_id,id),foreign key(tenant_id,exception_id) references public.group_schedule_exceptions(tenant_id,id)
);
create index academic_calendar_events_closure on public.academic_calendar_events(tenant_id,closure_id,created_at desc,id);
create index academic_calendar_events_exception on public.academic_calendar_events(tenant_id,exception_id,created_at desc,id);
alter table public.lesson_generation_batches add column closure_count integer not null default 0 check(closure_count>=0),add column exception_count integer not null default 0 check(exception_count>=0);
create table public.lesson_generation_skips (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,batch_id uuid not null,slot_id uuid not null,series_id uuid not null,group_id uuid not null,branch_id uuid not null,
 occurrence_date date not null,reason text not null check(reason in ('closure','exception')),closure_id uuid,exception_id uuid,
 check((reason='closure')=(closure_id is not null)),check((reason='exception')=(exception_id is not null)),
 unique(tenant_id,batch_id,series_id,occurrence_date),foreign key(tenant_id,batch_id) references public.lesson_generation_batches(tenant_id,id),
 foreign key(tenant_id,slot_id,series_id,group_id,branch_id) references public.group_schedule_slots(tenant_id,id,series_id,group_id,branch_id),
 foreign key(tenant_id,closure_id) references public.academic_closures(tenant_id,id),foreign key(tenant_id,exception_id) references public.group_schedule_exceptions(tenant_id,id)
);
create index lesson_generation_skips_batch on public.lesson_generation_skips(tenant_id,batch_id,occurrence_date,id);

create function private.closure_allowed(t uuid,b uuid,p text default 'schedules.view') returns boolean language sql stable security definer set search_path='' as $$
 select private.has_permission(t,'tenant.read') and case when b is not null then private.has_permission(t,p,b)
 when p='schedules.manage_holidays' then private.has_permission(t,p)
 else exists(select 1 from public.branches where tenant_id=t and private.has_permission(t,p,id)) end;
$$;
create function private.closure_hits(t uuid,b uuid,starts timestamptz,ends timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.academic_closures c where c.tenant_id=t and c.is_active and (c.branch_id is null or c.branch_id=b)
 and starts<((c.to_date+1)::timestamp at time zone c.timezone) and (c.from_date::timestamp at time zone c.timezone)<ends);
$$;
revoke all on function private.closure_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.closure_allowed(uuid,uuid,text) to authenticated;
revoke all on function private.closure_hits(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
alter table public.academic_closures enable row level security;
alter table public.group_schedule_exceptions enable row level security;
alter table public.academic_calendar_events enable row level security;
alter table public.lesson_generation_skips enable row level security;
revoke all on public.academic_closures,public.group_schedule_exceptions,public.academic_calendar_events,public.lesson_generation_skips from public,anon,authenticated;
grant select on public.academic_closures,public.group_schedule_exceptions to authenticated;
create policy academic_closures_read on public.academic_closures for select to authenticated using(private.closure_allowed(tenant_id,branch_id));
create policy schedule_exceptions_read on public.group_schedule_exceptions for select to authenticated using(private.schedule_allowed(tenant_id,group_id));
create trigger academic_calendar_events_immutable before update or delete on public.academic_calendar_events for each row execute function private.academic_history_immutable();
create trigger lesson_generation_skips_immutable before update or delete on public.lesson_generation_skips for each row execute function private.academic_history_immutable();
create function private.closure_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Non-teaching date history is retained';end if;
 perform 1 from public.tenants where id=new.tenant_id for update;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Choose a valid closure timezone';end if;
 if tg_op='UPDATE' then
  if (new.id,new.tenant_id,new.branch_id,new.timezone,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.branch_id,old.timezone,old.created_by,old.created_at) or new.version<>old.version+1 then raise exception 'Closure scope/timezone is immutable and version must advance once';end if;
  if old.from_date<(now() at time zone old.timezone)::date and (new.name,new.reason,new.from_date,new.to_date) is distinct from (old.name,old.reason,old.from_date,old.to_date) then raise exception 'Past closure definitions are retained; only their enabled state can change';end if;
 else
  if new.from_date<(now() at time zone new.timezone)::date then raise exception 'Create a current or future non-teaching date';end if;
 end if;
 return new;
end $$;
create function private.schedule_exception_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Weekly occurrence exception history is retained';end if;
 if tg_op='UPDATE' and ((new.id,new.tenant_id,new.group_id,new.branch_id,new.series_id,new.occurrence_date,new.created_by,new.created_at) is distinct from (old.id,old.tenant_id,old.group_id,old.branch_id,old.series_id,old.occurrence_date,old.created_by,old.created_at) or new.version<>old.version+1) then raise exception 'Occurrence exception scope/date is immutable and version must advance once';end if;return new;
end $$;
create trigger academic_closures_guard before insert or update or delete on public.academic_closures for each row execute function private.closure_guard();
create trigger schedule_exceptions_guard before insert or update or delete on public.group_schedule_exceptions for each row execute function private.schedule_exception_guard();
create function private.lesson_closure_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.tenants where id=new.tenant_id for update;
 if tg_op='INSERT' then
  if private.closure_hits(new.tenant_id,new.branch_id,new.starts_at,new.ends_at) then raise exception 'Non-teaching date conflict: choose a time outside active business or branch closures';end if;
  if new.series_id is not null and new.rescheduled_from_id is null and exists(select 1 from public.group_schedule_exceptions where tenant_id=new.tenant_id and series_id=new.series_id and occurrence_date=new.occurrence_date and is_active) then raise exception 'Weekly occurrence is explicitly skipped';end if;
 elsif new.status in ('scheduled','in_progress','completed') and (new.starts_at,new.ends_at,new.timezone,new.teacher_id,new.substitute_id,new.classroom_id) is distinct from (old.starts_at,old.ends_at,old.timezone,old.teacher_id,old.substitute_id,old.classroom_id) and private.closure_hits(new.tenant_id,new.branch_id,new.starts_at,new.ends_at) then raise exception 'Non-teaching date conflict: reschedule this retained lesson outside the closure';end if;
 return new;
end $$;
create trigger lesson_closures_guard before insert or update on public.lessons for each row execute function private.lesson_closure_guard();
revoke all on function private.closure_guard(),private.schedule_exception_guard(),private.lesson_closure_guard() from public,anon,authenticated;
