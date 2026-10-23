begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(25);
select has_table('public','cashboxes','Cashboxes exist');
select is((select count(*)::int from pg_tables where schemaname='public' and rowsecurity and tablename in
 ('finance_currencies','cashboxes','financial_transactions','financial_ledger_entries','financial_audit_events')),5,'Every finance table has RLS');
select ok(not has_table_privilege('authenticated','public.financial_ledger_entries','insert'),'Clients cannot bypass posting RPC');
select ok(not has_table_privilege('authenticated','public.financial_transactions','select'),'Money is read through exact-text RPCs');
select ok(not has_table_privilege('authenticated','public.financial_audit_events','update'),'Clients cannot rewrite financial audit');
create temporary table finance_scope(label text primary key,id uuid);
grant select,insert on finance_scope to authenticated;
insert into auth.users(id,email) values
 ('99998000-0000-0000-0000-000000000001','finance-native-owner@example.test'),
 ('99998000-0000-0000-0000-000000000002','finance-native-outsider@example.test');
set local role authenticated;
set local request.jwt.claim.sub='99998000-0000-0000-0000-000000000001';
insert into finance_scope select 'tenant',public.create_business('Native Finance');
insert into finance_scope select 'branch',id from public.branches limit 1;
insert into finance_scope select 'cashbox',public.save_cashbox((select id from finance_scope where label='tenant'),null,
 '99998000-0000-0000-0000-000000000010',jsonb_build_object('name','Native cashbox','cashbox_type','cash','branch_id',(select id from finance_scope where label='branch')));
select is((public.cashbox_details((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'))->>'balance'),'0.00','New cashboxes contain no fabricated money');
select is(public.save_cashbox((select id from finance_scope where label='tenant'),null,'99998000-0000-0000-0000-000000000010',jsonb_build_object('name','Native cashbox','cashbox_type','cash','branch_id',(select id from finance_scope where label='branch'))),(select id from finance_scope where label='cashbox'),'Create request is idempotent');
insert into finance_scope select 'opening',public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),'99998000-0000-0000-0000-000000000011','opening_balance','100.10','Native opening');
select is(public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),'99998000-0000-0000-0000-000000000011','opening_balance','100.1','Native opening'),(select id from finance_scope where label='opening'),'Posting request is idempotent');
select lives_ok($$select public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),gen_random_uuid(),'adjustment','0.20','Exact addition')$$,'Exact fractional adjustment succeeds');
select is((public.cashbox_details((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'))->>'balance'),'100.30','Balance derives from exact SQL sum');
select is((public.cashbox_details((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'))->>'total')::int,2,'Repeated request creates only one movement');
select throws_ok($$select public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),gen_random_uuid(),'adjustment','0','Zero rejected')$$,'P0001','Amount must be nonzero','Zero postings rejected');
select throws_ok($$select public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),gen_random_uuid(),'adjustment','0.001','Precision rejected')$$,'P0001','Use a decimal amount with at most 16 integer digits and 2 fractional digits','Excess precision is rejected rather than rounded');
select throws_ok($$select public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),gen_random_uuid(),'adjustment','-100.31','Overdraw rejected')$$,'P0001','Insufficient cashbox balance','Negative balance rejected');
select throws_ok($$select public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),gen_random_uuid(),'opening_balance','1','Repeat opening rejected')$$,'P0001','Opening balance must be the first posting','Opening is first-only');
select is((public.cashbox_details((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'))->>'audit_total')::int,3,'Creation and each committed posting have audit events');
select throws_ok($$delete from public.cashboxes$$,'42501','permission denied for table cashboxes','Client deletion denied');
set local request.jwt.claim.sub='99998000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.cashboxes),0,'Other user cannot read cashbox via RLS');
select throws_ok($$select public.cashbox_details((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'))$$,'42501','Cashbox access denied','Forged cashbox ID does not bypass authorization');
select throws_ok($$select public.post_cashbox_entry((select id from finance_scope where label='tenant'),(select id from finance_scope where label='cashbox'),gen_random_uuid(),'adjustment','1','Foreign posting')$$,'42501','Cashbox adjustment denied','Foreign posting rejected');
set local request.jwt.claim.sub='';
select is((select count(*)::int from public.cashboxes),0,'Subjectless authenticated client reads nothing');
reset role;
select throws_ok($$update public.financial_ledger_entries set amount=1 where transaction_id=(select id from finance_scope where label='opening')$$,'23514','Posted financial history is immutable','Privileged accidental history mutation is blocked too');
select throws_ok($$delete from public.cashboxes where id=(select id from finance_scope where label='cashbox')$$,'P0001','Cashboxes are retained; deactivate instead','Cashbox history is retained');
select is((select count(*)::int from public.financial_transactions where tenant_id=(select id from finance_scope where label='tenant')),2,'Failed postings leave no envelopes');
select has_trigger('public','financial_ledger_entries','finance_leg_complete','Deferred integrity also checks insertions against existing envelopes');
select * from finish();
rollback;
