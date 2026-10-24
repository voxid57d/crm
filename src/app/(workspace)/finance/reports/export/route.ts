import { reportContext } from "@/features/finance/reports-queries";
import {
  financeReports,
  type ReportData,
} from "@/features/finance/reports-config";
import { reportCsv } from "@/lib/csv.mjs";
export async function GET(request: Request) {
  const search = Object.fromEntries(new URL(request.url).searchParams),
    { workspace: w, kind, filters } = await reportContext(search);
  const r = await w.supabase.rpc("financial_report_export", {
    p_tenant: w.tenant.id,
    p_report: kind,
    p_filters: filters,
  });
  if (r.error)
    return Response.json(
      {
        error:
          r.error.code === "42501"
            ? "Report access denied."
            : "Export failed. Check filters and narrow the result to at most 5000 rows.",
      },
      {
        status: r.error.code === "42501" ? 403 : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  const data = r.data as unknown as ReportData;
  return new Response(reportCsv(financeReports[kind].columns, data.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-${kind}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
