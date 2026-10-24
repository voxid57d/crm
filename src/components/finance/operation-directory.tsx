import Link from "next/link";
import { operationDirectory } from "@/features/finance/operations-queries";
import type { OperationKind } from "@/features/finance/operations-types";
import type { FinanceSearch } from "@/features/finance/types";
import { financeDate } from "@/features/finance/queries";
import { formatMoney } from "@/features/finance/money.mjs";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination } from "./pagination";
export const operationPaths = {
  expense: "expenses",
  transfer: "transfers",
  refund: "refunds",
};
export const operationTitles = {
  expense: "Expenses",
  transfer: "Cashbox transfers",
  refund: "Refunds",
};
export async function OperationDirectory({
  kind,
  search,
}: {
  kind: OperationKind;
  search: FinanceSearch;
}) {
  const {
      workspace: w,
      rows,
      total,
      page,
      filters,
    } = await operationDirectory(kind, search),
    path = `/finance/${operationPaths[kind]}`;
  const create = w.permissions.has(
    kind === "expense" ? "expenses.create" : "cashboxes.transfer",
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <h1 className="text-3xl font-semibold">{operationTitles[kind]}</h1>
        <div className="flex gap-3">
          {kind === "expense" &&
            w.businessPermissions.has("expenses.manage") && (
              <Button asChild variant="outline">
                <Link href="/finance/expenses/categories">Categories</Link>
              </Button>
            )}
          {kind !== "refund" && create && (
            <Button asChild>
              <Link href={`${path}/new`}>
                {kind === "expense" ? "Record expense" : "Transfer funds"}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Authorized history in {w.tenant.timezone}. Posted records are retained.{" "}
        {kind === "refund"
          ? "Open the original payment to record a linked refund."
          : "Corrections use an audited reversal."}
      </p>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Field
          label="Search"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
        />
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={filters.branch ?? ""}
        >
          <option value="">All authorized branches</option>
          {w.branches.map((b) => (
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
        <Button>Filter history</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {[
                "Effective date",
                "Cashbox",
                "Details",
                "Amount (UZS)",
                "Recorded by",
                "Status",
              ].map((h) => (
                <th key={h} className="p-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="border-t" key={r.id}>
                <td className="whitespace-nowrap p-4">
                  <Link
                    className="text-primary underline"
                    href={
                      kind === "refund"
                        ? `/finance/payments/${r.payment_id}`
                        : `${path}/${r.id}`
                    }
                  >
                    {financeDate(r.occurred_at, w.tenant.timezone)}
                  </Link>
                </td>
                <td className="p-4">
                  {r.cashbox_name}
                  {r.destination_name ? ` → ${r.destination_name}` : ""}
                </td>
                <td className="min-w-52 max-w-md break-words p-4">
                  {r.category_name || r.customer_name}
                  <p className="text-xs text-muted-foreground">{r.reason}</p>
                </td>
                <td className="whitespace-nowrap p-4 tabular-nums">
                  {formatMoney(r.amount, r.currency)}
                </td>
                <td className="p-4">{r.actor_name}</td>
                <td className="p-4">{r.reversed ? "Reversed" : "Posted"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={6}
                  className="p-8 text-center text-muted-foreground"
                >
                  No authorized records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <FinancePagination
        path={path}
        page={page}
        filters={filters}
        total={total}
      />
    </div>
  );
}
