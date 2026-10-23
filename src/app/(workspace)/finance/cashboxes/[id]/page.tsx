import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, SelectField } from "@/components/forms/field";
import { PostingForm } from "@/components/finance/posting-form";
import { FinancePagination } from "@/components/finance/pagination";
import {
  getCashbox,
  canCashbox,
  financeFilters,
  pageNumber,
  financeDate,
} from "@/features/finance/queries";
import { formatMoney } from "@/features/finance/money.mjs";
import type { FinanceSearch } from "@/features/finance/types";
import type { Json } from "@/lib/supabase/database.types";
export const metadata = { title: "Cashbox history" };
const labels: Record<string, string> = {
  opening_balance: "Opening balance",
  adjustment: "Adjustment",
  cashbox_created: "Cashbox created",
  cashbox_updated: "Cashbox updated",
};
function AuditValues({ data }: { data: Json }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const allowed: Record<string, string> = {
    name: "Name",
    cashbox_type: "Type",
    is_active: "Active",
    amount: "Amount",
    currency: "Currency",
  };
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {Object.entries(data)
        .filter(([key]) => allowed[key])
        .map(([key, v]) => (
          <div key={key}>
            <dt className="inline font-medium">{allowed[key]}: </dt>
            <dd className="inline">{String(v)}</dd>
          </div>
        ))}
    </dl>
  );
}
export default async function CashboxProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FinanceSearch>;
}) {
  const { id } = await params,
    search = await searchParams,
    page = pageNumber(search),
    auditPage = pageNumber(search, "audit_page");
  const filters = financeFilters(search, ["from", "to", "kind", "actor"]);
  const { workspace, detail } = await getCashbox(
    id,
    JSON.stringify(filters),
    page,
    auditPage,
  );
  const b = detail.cashbox,
    manage = canCashbox(workspace, "cashboxes.manage", b.branch_id),
    adjust = canCashbox(workspace, "cashboxes.adjust", b.branch_id),
    audit = canCashbox(workspace, "finance.audit.view", b.branch_id);
  const active =
    b.is_active &&
    (!b.branch_id ||
      workspace.branches.some(
        (branch) => branch.id === b.branch_id && branch.is_active,
      ));
  const path = `/finance/cashboxes/${id}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-primary underline"
            href="/finance/cashboxes"
          >
            All cashboxes
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {b.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.branch_name ?? "Business-wide"} · {b.cashbox_type} ·{" "}
            {b.currency}
          </p>
        </div>
        {manage && (
          <Button variant="outline" asChild>
            <Link href={`${path}/edit`}>Edit cashbox</Link>
          </Button>
        )}
      </div>
      {search.posted === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Financial posting saved.
        </p>
      )}
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Cashbox saved.
        </p>
      )}
      <section className="space-y-3 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Current calculated balance
          </h2>
          <Badge variant={b.is_active ? "secondary" : "outline"}>
            {b.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="break-words text-2xl font-semibold tabular-nums md:text-3xl">
          {formatMoney(detail.balance, b.currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          Sum of all posted ledger movements. History filters do not change this
          current balance. Times and date filters use{" "}
          {workspace.tenant.timezone}.
        </p>
      </section>
      {adjust && active && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {!detail.has_entries && (
            <PostingForm
              tenantId={workspace.tenant.id}
              cashboxId={id}
              opening
            />
          )}
          <PostingForm tenantId={workspace.tenant.id} cashboxId={id} />
        </div>
      )}
      {!active && (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          This cashbox or its branch is inactive. History remains available; new
          postings are blocked.
        </p>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Posted transaction history</h2>
        <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
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
          <SelectField
            label="Posting type"
            name="kind"
            defaultValue={filters.kind ?? ""}
          >
            <option value="">All postings</option>
            <option value="opening_balance">Opening balance</option>
            <option value="adjustment">Adjustment</option>
          </SelectField>
          <SelectField
            label="Recorded by"
            name="actor"
            defaultValue={filters.actor ?? ""}
          >
            <option value="">All recorders</option>
            {detail.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <Button type="submit">Filter history</Button>
        </form>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Immutable cashbox ledger</caption>
            <thead className="bg-muted/50">
              <tr>
                {["Posted at", "Type", "Amount", "Recorded by", "Reason"].map(
                  (h) => (
                    <th key={h} scope="col" className="p-4 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="whitespace-nowrap p-4">
                    {financeDate(row.posted_at, workspace.tenant.timezone)}
                  </td>
                  <td className="p-4">{labels[row.kind] ?? row.kind}</td>
                  <td className="whitespace-nowrap p-4 text-right font-medium tabular-nums">
                    {formatMoney(row.amount, row.currency)}
                  </td>
                  <td className="p-4">{row.actor_name}</td>
                  <td className="min-w-48 max-w-md break-words p-4">
                    {row.reason}
                  </td>
                </tr>
              ))}
              {detail.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No postings match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          path={path}
          filters={{ ...filters, audit_page: String(auditPage) }}
          page={page}
          total={detail.total}
        />
      </section>
      {audit && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Financial audit history</h2>
          <ol className="divide-y rounded-xl border bg-white">
            {detail.audit.map((event) => (
              <li className="space-y-2 p-5" key={event.id}>
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="font-medium">
                    {labels[event.operation] ?? event.operation}
                  </p>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={event.created_at}
                  >
                    {financeDate(event.created_at, workspace.tenant.timezone)}
                  </time>
                </div>
                <p className="text-sm">
                  {event.actor_name}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
                {event.before_data && (
                  <div>
                    <p className="text-xs font-medium">Before</p>
                    <AuditValues data={event.before_data} />
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium">
                    {event.before_data ? "After" : "Recorded details"}
                  </p>
                  <AuditValues data={event.after_data} />
                </div>
              </li>
            ))}
          </ol>
          <FinancePagination
            path={path}
            filters={{ ...filters, page: String(page) }}
            page={auditPage}
            pageKey="audit_page"
            total={detail.audit_total}
          />
        </section>
      )}
    </div>
  );
}
