create function public.financial_report_export(p_tenant uuid,p_report text,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;count_rows integer;
begin
 -- One database statement provides a consistent bounded snapshot for each file.
 with rows as materialized(select v from private.finance_report_rows(p_tenant,p_report,p_filters) v limit 5001)
 select count(*)::integer,coalesce(jsonb_agg(v order by v->>'date' desc nulls last,v->>'id'),'[]') into count_rows,result from rows;
 if count_rows>5000 then raise exception 'Export exceeds 5000 rows; narrow the report filters';end if;
 return jsonb_build_object('total',count_rows,'rows',result);
end $$;
revoke all on function public.financial_report_export(uuid,text,jsonb) from public,anon;
grant execute on function public.financial_report_export(uuid,text,jsonb) to authenticated;
