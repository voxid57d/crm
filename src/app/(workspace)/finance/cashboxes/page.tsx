import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, SelectField } from "@/components/forms/field";
import { cashboxDirectory, canCashbox } from "@/features/finance/queries";
import { formatMoney } from "@/features/finance/money.mjs";
import type { FinanceSearch } from "@/features/finance/types";
import { FinancePagination } from "@/components/finance/pagination";
export const metadata = { title: "Cashboxes" };
export default async function Cashboxes({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const { workspace, rows, total, page, filters } = await cashboxDirectory(
    await searchParams,
  );
  const create =
    canCashbox(workspace, "cashboxes.manage", null) ||
    workspace.branches.some(
      (b) => b.is_active && canCashbox(workspace, "cashboxes.manage", b.id),
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cashboxes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Calculated balances in UZS · {workspace.tenant.name}
          </p>
        </div>
        {create && (
          <Button asChild>
            <Link href="/finance/cashboxes/new">Create cashbox</Link>
          </Button>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Search cashboxes"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
        />
        <SelectField
          label="Branch scope"
          name="branch"
          defaultValue={filters.branch ?? ""}
        >
          <option value="">All permitted cashboxes</option>
          {canCashbox(workspace, "cashboxes.view", null) && (
            <option value="business">Business-wide only</option>
          )}
          {workspace.branches
            .filter((b) => canCashbox(workspace, "cashboxes.view", b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {!b.is_active ? " (inactive)" : ""}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Status"
          name="status"
          defaultValue={filters.status ?? "all"}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        <SelectField label="Type" name="type" defaultValue={filters.type ?? ""}>
          <option value="">All types</option>
          <option value="cash">Cash</option>
          <option value="bank">Bank account (manual)</option>
          <option value="other">Other</option>
        </SelectField>
        <SelectField
          label="Sort"
          name="sort"
          defaultValue={filters.sort ?? "name"}
        >
          <option value="name">Name</option>
          <option value="balance">Highest balance</option>
          <option value="newest">Newest</option>
        </SelectField>
        <Button type="submit">Apply filters</Button>
      </form>
      {!workspace.permissions.has("cashboxes.view") ? (
        <p role="alert">Your role has no financial access.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Authorized cashbox balances</caption>
              <thead className="bg-muted/50">
                <tr>
                  {[
                    "Cashbox",
                    "Scope",
                    "Type",
                    "Status",
                    "Current balance",
                  ].map((h) => (
                    <th className="p-4 font-medium" key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-4">
                      <Link
                        className="font-medium text-primary underline"
                        href={`/finance/cashboxes/${b.id}`}
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="p-4">{b.branch_name ?? "Business-wide"}</td>
                    <td className="p-4 capitalize">{b.cashbox_type}</td>
                    <td className="p-4">
                      <Badge variant={b.is_active ? "secondary" : "outline"}>
                        {b.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap p-4 text-right font-medium tabular-nums">
                      {formatMoney(b.balance, b.currency)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No cashboxes match your authorized scope and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <FinancePagination
            path="/finance/cashboxes"
            filters={filters}
            page={page}
            total={total}
          />
        </>
      )}
    </div>
  );
}
