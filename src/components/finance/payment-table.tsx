import Link from "next/link";
import { formatMoney } from "@/features/finance/money.mjs";
import { financeDate } from "@/features/finance/queries";
import type { PaymentRow } from "@/features/finance/operations-types";
export function PaymentTable({
  rows,
  zone,
}: {
  rows: PaymentRow[];
  zone: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Authorized customer payments</caption>
        <thead className="bg-muted/50">
          <tr>
            {[
              "Payment date",
              "Customer",
              "Cashbox / method",
              "Received",
              "Allocated",
              "Available credit",
              "Recorded by",
            ].map((h) => (
              <th key={h} scope="col" className="p-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-4">
                <Link
                  className="text-primary underline"
                  href={`/finance/payments/${p.id}`}
                >
                  {financeDate(p.paid_at, zone)}
                </Link>
              </td>
              <td className="p-4">{p.customer_name}</td>
              <td className="p-4">
                {p.cashbox_name} · {p.method.replaceAll("_", " ")}
              </td>
              {[p.amount, p.allocated, p.credit].map((v, i) => (
                <td
                  className="whitespace-nowrap p-4 text-right tabular-nums"
                  key={i}
                >
                  {formatMoney(v, p.currency)}
                </td>
              ))}
              <td className="p-4">{p.actor_name}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground">
                No payments match your authorized scope and filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
