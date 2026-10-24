import Link from "next/link";
import { getWorkspace } from "@/features/workspace/context";
import { value, financeFilters } from "@/features/finance/queries";
import { financePeriod } from "@/features/finance/period.mjs";
import {
  financeReports,
  type FinancialDashboard,
} from "@/features/finance/reports-config";
import { formatMoney } from "@/features/finance/money.mjs";
import type { FinanceSearch } from "@/features/finance/types";
import { ReportTable } from "@/components/finance/report-table";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Financial dashboard" };
const metrics: Record<string, string> = {
  received: "Gross payments received",
  refunds: "Refunds paid",
  net_collections: "Net collections after refunds",
  expenses: "Net expense movements",
  invoiced: "Issued invoice totals",
  outstanding: "Current outstanding debt",
  overdue: "Current overdue debt",
  cashbox_balance: "Current cashbox balances",
  net_cash_movement: "Net cash movement",
};
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const w = await getWorkspace(),
    search = await searchParams;
  if (!w.permissions.has("finance.dashboard.view"))
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">Finance</h1>
        <p>
          Your role has no financial dashboard permission. Use the permitted
          finance sections in the navigation.
        </p>
      </div>
    );
  const preset = value(search, "preset") || "month",
    filters = financeFilters(search, ["branch", "from", "to"]);
  if (
    !Object.hasOwn(search, "branch") &&
    w.branch &&
    w.branchPermissions.get(w.branch.id)?.has("finance.dashboard.view")
  )
    filters.branch = w.branch.id;
  if (preset !== "custom")
    Object.assign(
      filters,
      financePeriod(new Date(), w.tenant.timezone, preset),
    );
  const r = await w.supabase.rpc("financial_dashboard", {
    p_tenant: w.tenant.id,
    p_filters: filters,
  });
  if (r.error)
    throw new Error(
      "Dashboard could not load. Check date range, branch access and local services.",
    );
  const d = r.data as unknown as FinancialDashboard;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Financial dashboard</h1>
      <p className="text-sm text-muted-foreground">
        {w.tenant.name} ·{" "}
        {w.branches.find((b) => b.id === filters.branch)?.name ??
          "All authorized scopes"}{" "}
        · UZS · {w.tenant.timezone}
      </p>
      <div className="flex flex-wrap gap-3">
        {[
          ["today", "Today"],
          ["week", "This week"],
          ["month", "This month"],
        ].map(([key, label]) => (
          <Button
            asChild
            key={key}
            variant={preset === key ? "default" : "outline"}
          >
            <Link
              href={
                "/finance?" +
                new URLSearchParams({
                  preset: key,
                  branch: filters.branch ?? "",
                })
              }
            >
              {label}
            </Link>
          </Button>
        ))}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="preset" value="custom" />
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={filters.branch ?? ""}
        >
          <option value="">All authorized scopes</option>
          {w.branches
            .filter((b) =>
              w.branchPermissions.get(b.id)?.has("finance.dashboard.view"),
            )
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
        <Field
          label="From date"
          name="from"
          type="date"
          defaultValue={filters.from}
        />
        <Field
          label="To date (inclusive)"
          name="to"
          type="date"
          defaultValue={filters.to}
        />
        <Button>Apply custom range</Button>
      </form>
      <p className="text-sm leading-6 text-muted-foreground">
        Receipts, refunds, issued invoice totals and net expense/cash movements
        use the selected period. Debt, overdue debt and cashbox balances are
        current snapshots. Net expenses include reversals in their correction
        period. Cash movements include opening balances, adjustments and
        transfers; collections do not. These figures do not represent accounting
        profit.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(metrics).map(([key, label]) => (
          <section
            key={key}
            className="space-y-3 rounded-xl border bg-white p-5"
          >
            <h2 className="text-sm text-muted-foreground">{label}</h2>
            <p className="break-words text-2xl font-semibold tabular-nums">
              {d.metrics[key] == null
                ? "Unavailable in this scope"
                : formatMoney(d.metrics[key]!)}
            </p>
          </section>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Daily collections and expense trends
        </h2>
        <p className="text-xs text-muted-foreground">
          Up to 60 most recent days with authorized activity in this period.
        </p>
        <ReportTable
          columns={[
            { key: "trend_date", label: "Business date" },
            { key: "received", label: "Gross received (UZS)", type: "money" },
            { key: "refunds", label: "Refunds (UZS)", type: "money" },
            { key: "expenses", label: "Net expenses (UZS)", type: "money" },
          ]}
          rows={d.trends.map((row) => ({ ...row, id: row.trend_date }))}
          timezone={w.tenant.timezone}
          caption="Daily financial trends"
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Branch comparison</h2>
        <ReportTable
          columns={financeReports.branches.columns}
          rows={d.branches}
          timezone={w.tenant.timezone}
          caption="Branch financial comparison"
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent cash movements</h2>
        <ReportTable
          columns={financeReports.cashbox_transactions.columns}
          rows={d.recent}
          timezone={w.tenant.timezone}
          caption="Recent cash movements"
        />
      </section>
    </div>
  );
}
