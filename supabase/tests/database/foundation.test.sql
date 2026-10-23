begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

select has_table('public', 'tenants', 'Tenant table exists');
select has_table('public', 'branches', 'Branch table exists');
select is((select count(*)::int from pg_tables where schemaname = 'public'
  and tablename in ('tenants', 'branches', 'tenant_memberships', 'branch_memberships', 'role_permissions')
  and rowsecurity), 5, 'All foundation tables enforce RLS');
select ok(not has_table_privilege('anon', 'public.tenants', 'select'), 'Anonymous tenant reads denied');
select ok(not has_table_privilege('authenticated', 'public.tenant_memberships', 'update'), 'API cannot assign roles');
select ok(not has_table_privilege('authenticated', 'public.role_permissions', 'insert'), 'API cannot add role permissions');
select ok(not has_column_privilege('authenticated', 'public.branches', 'tenant_id', 'update'), 'API cannot transfer branches');
set local role authenticated;
select is((select count(*)::int from public.tenants), 0, 'No JWT subject means no tenant access');
reset role;
select * from finish();
rollback;
