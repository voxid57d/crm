import {
  salesOptions,
  salesFilters,
  type Search,
} from "@/features/sales/queries";
import { analytics } from "@/features/sales/parsers";
import { SalesFilters } from "./filters";
import type { Breakdown } from "@/features/sales/types";

function BreakdownChart({ title, rows }: { title: string; rows: Breakdown[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.label + i}>
              <div className="flex justify-between gap-3 text-xs">
                <span>{r.label}</span>
                <span className="font-medium">{r.count}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No records in this cohort.
        </p>
      )}
    </section>
  );
}
export async function SalesAnalytics({
  search,
  report = false,
}: {
  search: Search;
  report?: boolean;
}) {
  const options = await salesOptions(),
    { workspace } = options;
  if (!workspace.permissions.has("leads.view_analytics"))
    return <p role="alert">Sales analytics permission is required.</p>;
  let filters: Record<string, string>;
  try {
    filters = salesFilters(search, workspace.branch?.id);
  } catch {
    return (
      <p role="alert">
        Invalid report filters. Use valid branch IDs and calendar date ranges.
      </p>
    );
  }
  delete filters.archived;
  const result = await workspace.supabase.rpc("sales_analytics", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
  });
  if (result.error)
    return (
      <p role="alert">
        Sales analytics could not load. Check date filters and branch
        permissions.
      </p>
    );
  const data = analytics(result.data);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">
        {report ? "Sales reports" : "Sales dashboard"}
      </h1>
      <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
        Metrics use non-archived leads created in the selected inclusive date
        range in {workspace.tenant.timezone}, within your viewing and analytics
        permissions. Conversion rate is currently converted leads ÷ all leads in
        that creation cohort. Lost includes disqualified; New means open in the
        pipeline’s first active open stage. Overdue follow-ups are pending tasks
        for that same cohort.
      </p>
      <SalesFilters options={options} filters={filters} analytics />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total leads", data.total],
          ["New leads", data.new_leads],
          ["Converted", data.converted],
          ["Lost / disqualified", data.lost],
          ["Conversion rate", `${data.conversion_rate}%`],
          ["Overdue follow-ups", data.overdue_followups],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <BreakdownChart title="Leads by source" rows={data.sources} />
        <BreakdownChart title="Leads by stage" rows={data.stages} />
        <BreakdownChart title="Leads by employee" rows={data.employees} />
        <BreakdownChart title="Leads by branch" rows={data.branches} />
        <BreakdownChart
          title="Lead creation trend (business-local dates)"
          rows={data.trend}
        />
      </div>
    </div>
  );
}
