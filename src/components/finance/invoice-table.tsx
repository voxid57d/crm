import Link from "next/link";
import { formatMoney } from "@/features/finance/money.mjs";
import type { InvoiceRow } from "@/features/finance/invoice-types";
export function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Authorized invoice documents</caption>
        <thead className="bg-muted/50">
          <tr>
            {[
              "Invoice",
              "Customer",
              "Branch",
              "Status",
              "Due date",
              "Invoice total",
              "Outstanding",
            ].map((h) => (
              <th key={h} scope="col" className="p-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-4">
                <Link
                  className="font-medium text-primary underline"
                  href={`/finance/invoices/${r.id}`}
                >
                  {r.invoice_number ?? "Draft invoice"}
                </Link>
              </td>
              <td className="p-4">{r.customer_name}</td>
              <td className="p-4">{r.branch_name}</td>
              <td className="p-4 capitalize">{r.status}</td>
              <td className="whitespace-nowrap p-4">{r.due_date}</td>
              <td className="whitespace-nowrap p-4 text-right tabular-nums">
                {formatMoney(r.total, r.currency)}
              </td>
              <td className="whitespace-nowrap p-4 text-right font-medium tabular-nums">
                {r.state === "draft" || r.state === "discarded"
                  ? "Not issued"
                  : formatMoney(r.outstanding, r.currency)}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground">
                No invoices match your authorized scope and filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
