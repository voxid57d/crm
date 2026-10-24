-- Correct query contracts checked against installed PostgreSQL and invoice RPCs.
do $$ declare definition text;begin
 select pg_get_functiondef('private.finance_report_rows(uuid,text,jsonb,text)'::regprocedure) into definition;
 definition:=replace(definition,'i.display_status','i.status');execute definition;
 select pg_get_functiondef('private.finance_report_check(uuid,jsonb,text)'::regprocedure) into definition;
 definition:=replace(definition,';ignored uuid','');
 definition:=replace(definition,'ignored:=','perform ');execute definition;
end $$;
