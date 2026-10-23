begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);
create temporary table test_scope(label text primary key, id uuid);
grant select, insert on test_scope to authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
  ('77770000-0000-0000-0000-000000000001','pgtap-a@example.test','{"full_name":"A","role":"owner"}'),
  ('77770000-0000-0000-0000-000000000002','pgtap-b@example.test','{}'),
  ('77770000-0000-0000-0000-000000000003','pgtap-manager@example.test','{}');
set local role authenticated;
set local request.jwt.claim.sub = '77770000-0000-0000-0000-000000000001';
insert into test_scope select 'a', public.create_business('pgTAP A');
insert into test_scope select 'branch-a', id from public.branches limit 1;
select is((select count(*)::int from public.tenants),1,'A sees its business');
select is((select owner_id::text from public.tenants),'77770000-0000-0000-0000-000000000001','Creator is canonical Owner');
select is((select currency from public.tenants),'UZS','Currency defaults to UZS');
select lives_ok($$insert into public.branches(tenant_id,name) select id,'Second' from test_scope where label='a' returning id$$,'Owner can insert and read a new branch');
select public.set_business_member((select id from test_scope where label='a'),'pgtap-manager@example.test','manager',array[(select id from test_scope where label='branch-a')]);
set local request.jwt.claim.sub = '77770000-0000-0000-0000-000000000002';
insert into test_scope select 'b', public.create_business('pgTAP B');
select is((select count(*)::int from public.tenants where id=(select id from test_scope where label='a')),0,'B cannot read A by ID');
with changed as (update public.tenants set name='Forbidden' where id=(select id from test_scope where label='a') returning id)
select is((select count(*)::int from changed),0,'B cannot update A');
set local request.jwt.claim.sub = '77770000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.branches),1,'Manager sees only assigned branch');
select throws_ok($$select public.set_business_member((select id from test_scope where label='a'),'pgtap-manager@example.test','admin')$$,'42501','Owner permission required','Manager cannot escalate');
select is((select count(*)::int from public.profiles),1,'Profile reads are self-only');
select ok(not private.has_permission((select id from test_scope where label='a'),'platform.admin'),'Tenant role never grants platform administration');
reset role;
select * from finish();
rollback;
