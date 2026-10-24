do $$ declare definition text;begin
 select pg_get_functiondef('private.finance_report_rows(uuid,text,jsonb,text)'::regprocedure) into definition;
 definition:=replace(definition,'i.overdue_days','i.days_overdue');execute definition;
end $$;
