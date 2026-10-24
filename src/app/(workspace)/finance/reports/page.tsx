import Link from "next/link";
import { getReport, reportOptions } from "@/features/finance/reports-queries";
import { financeReports } from "@/features/finance/reports-config";
import type { FinanceSearch } from "@/features/finance/types";
import { ReportTable } from "@/components/finance/report-table";
import { FinancePagination } from "@/components/finance/pagination";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Financial reports" };
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const {
      workspace: w,
      kind,
      filters,
      page,
      data,
    } = await getReport(await searchParams),
    options = await reportOptions(filters),
    config = financeReports[kind];
  const params = new URLSearchParams({ ...filters, report: kind });
  const select = (
    label: string,
    name: string,
    choices: { id: string; name: string }[],
  ) => (
    <SelectField label={label} name={name} defaultValue={filters[name] ?? ""}>
      <option value="">All authorized {label.toLowerCase()}s</option>
      {filters[name] && !choices.some((o) => o.id === filters[name]) && (
        <option value={filters[name]}>Selected {label.toLowerCase()}</option>
      )}
      {choices.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </SelectField>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <h1 className="text-3xl font-semibold">Financial reports</h1>
        {(kind !== "customer_statement" || filters.customer) && (
          <Button asChild variant="outline">
            <Link prefetch={false} href={`/finance/reports/export?${params}`}>
              Export CSV
            </Link>
          </Button>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">
        <SelectField label="Report" name="report" defaultValue={kind}>
          {Object.entries(financeReports).map(([key, r]) => (
            <option key={key} value={key}>
              {r.title}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={filters.branch ?? ""}
        >
          <option value="">All authorized scopes</option>
          {w.branches
            .filter((b) =>
              w.branchPermissions.get(b.id)?.has("finance.reports.view"),
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
        {select("Customer", "customer", options.customers)}
        {select("Cashbox", "cashbox", options.cashboxes)}
        {select("Recorder", "actor", options.actors)}
        {select("Category", "category", options.categories)}
        <SelectField
          label="Payment method"
          name="method"
          defaultValue={filters.method ?? ""}
        >
          <option value="">All methods</option>
          {["cash", "bank_transfer", "card_terminal", "other"].map((m) => (
            <option key={m} value={m}>
              {m.replaceAll("_", " ")}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Transaction type"
          name="kind"
          defaultValue={filters.kind ?? ""}
        >
          <option value="">All types</option>
          {[
            "opening_balance",
            "adjustment",
            "payment",
            "expense",
            "transfer",
            "refund",
            "reversal",
          ].map((k) => (
            <option key={k} value={k}>
              {k.replaceAll("_", " ")}
            </option>
          ))}
        </SelectField>
        <Field
          label="Search (where applicable)"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
        />
        <Button>Run report</Button>
      </form>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{config.title}</h2>
        <p className="text-sm text-muted-foreground">
          {config.note} Dates use {w.tenant.timezone}. Amounts are UZS. Filters
          apply to relevant fields; unavailable values appear as a dash. CSV
          export allows up to 5,000 rows.
        </p>
        {kind === "customer_statement" && !filters.customer ? (
          <p className="rounded-xl border p-5">
            Choose a customer and run the report.
          </p>
        ) : (
          <>
            <ReportTable
              columns={config.columns}
              rows={data.rows}
              timezone={w.tenant.timezone}
              caption={config.title}
            />
            <FinancePagination
              path="/finance/reports"
              filters={{ ...filters, report: kind }}
              page={page}
              total={data.total}
            />
          </>
        )}
      </section>
    </div>
  );
}
