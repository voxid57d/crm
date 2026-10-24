import Link from "next/link";
import { invoiceDirectory } from "@/features/finance/invoice-queries";
import { InvoiceFilters } from "@/components/finance/invoice-filters";
import { DebtSummary } from "@/components/finance/debt-summary";
import { FinancePagination } from "@/components/finance/pagination";
import { formatMoney } from "@/features/finance/money.mjs";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Customer receivables" };
export default async function Debts({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const { workspace, data, page, filters } = await invoiceDirectory(
    await searchParams,
    true,
  );
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Customer receivables
      </h1>
      <p className="text-sm text-muted-foreground">
        Outstanding issued invoices in your authorized branches. Aging uses{" "}
        {workspace.tenant.timezone}. Each invoice belongs to one branch; shared
        customers are counted once per invoice. Balances include allocations,
        released allocations, invoice voids and refunds that reopen debt.
      </p>
      <InvoiceFilters workspace={workspace} filters={filters} debts />
      {workspace.permissions.has("debts.view") ? (
        <>
          <DebtSummary summary={data.summary} />
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Customers with outstanding invoices
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  {[
                    "Customer",
                    "Open invoices",
                    "Earliest unpaid due date",
                    "Outstanding",
                    "Overdue",
                    "Details",
                  ].map((h) => (
                    <th key={h} scope="col" className="p-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={`${r.customer_id}:${r.currency}`}
                    className="border-t"
                  >
                    <td className="p-4">{r.customer_name}</td>
                    <td className="p-4">{r.invoice_count}</td>
                    <td className="p-4">{r.next_due_date}</td>
                    <td className="whitespace-nowrap p-4 text-right tabular-nums">
                      {formatMoney(r.outstanding, r.currency)}
                    </td>
                    <td className="whitespace-nowrap p-4 text-right tabular-nums">
                      {formatMoney(r.overdue, r.currency)}
                    </td>
                    <td className="p-4">
                      <Link
                        className="text-primary underline"
                        href={`/finance/invoices?${new URLSearchParams({ ...filters, customer: r.customer_id })}`}
                      >
                        View invoices
                      </Link>
                      {r.customer_visible && (
                        <Link
                          className="mt-2 block text-primary underline"
                          href={`/customers/${r.customer_id}/finance`}
                        >
                          Customer finances
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No outstanding invoices match your authorized scope and
                      filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <FinancePagination
            path="/finance/debts"
            filters={filters}
            total={data.total}
            page={page}
          />
        </>
      ) : (
        <p role="alert">Your role has no receivables access.</p>
      )}
    </div>
  );
}
