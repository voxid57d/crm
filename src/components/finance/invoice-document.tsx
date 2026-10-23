import { formatMoney } from "@/features/finance/money.mjs";
import type { InvoiceDetail } from "@/features/finance/invoice-types";
export function InvoiceDocument({ detail }: { detail: InvoiceDetail }) {
  const h = detail.invoice;
  return (
    <article className="space-y-6 rounded-xl border bg-white p-5 md:p-8">
      <div className="flex flex-wrap justify-between gap-5">
        <div>
          <h2 className="text-2xl font-semibold">
            {h.invoice_number ?? "Draft invoice"}
          </h2>
          <p className="mt-2 text-sm capitalize">
            {detail.status} · {h.currency}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
          <dt>Issue date</dt>
          <dd>{h.issue_date}</dd>
          <dt>Due date</dt>
          <dd>{h.due_date}</dd>
        </dl>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="space-y-1 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            From
          </h3>
          <p className="font-medium">{h.issuer.name}</p>
          <p>{h.branch_name}</p>
          {h.issuer.address && <p>{h.issuer.address}</p>}
          {h.issuer.phone && <p>{h.issuer.phone}</p>}
          {h.issuer.email && <p>{h.issuer.email}</p>}
        </section>
        <section className="space-y-1 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Bill to
          </h3>
          <p className="font-medium">{h.bill_to.name}</p>
          <p>{h.bill_to.phone}</p>
          {h.bill_to.email && <p>{h.bill_to.email}</p>}
          {h.bill_to.address && <p>{h.bill_to.address}</p>}
        </section>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Invoice line items</caption>
          <thead className="border-y">
            <tr>
              {[
                "Description",
                "Quantity",
                "Unit price",
                "Discount",
                "Line total",
              ].map((label) => (
                <th key={label} className="py-3 pr-4 font-medium" scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.items.map((item, i) => (
              <tr className="border-b" key={item.id ?? i}>
                <td className="min-w-40 break-words py-4 pr-4">
                  {item.description}
                </td>
                <td className="py-4 pr-4">{item.quantity}</td>
                {[item.unit_price, item.discount_amount, item.line_total].map(
                  (amount, index) => (
                    <td
                      key={index}
                      className="whitespace-nowrap py-4 pr-4 text-right tabular-nums"
                    >
                      {formatMoney(amount, h.currency)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid max-w-md grid-cols-2 gap-x-5 gap-y-3 text-sm">
        <dt>Subtotal after line discounts</dt>
        <dd className="text-right tabular-nums">
          {formatMoney(detail.subtotal, h.currency)}
        </dd>
        <dt>Invoice discount</dt>
        <dd className="text-right tabular-nums">
          {formatMoney(h.discount_amount, h.currency)}
        </dd>
        <dt className="font-semibold">Invoice total</dt>
        <dd className="text-right font-semibold tabular-nums">
          {formatMoney(detail.total, h.currency)}
        </dd>
        {h.state !== "draft" && h.state !== "discarded" && (
          <>
            <dt>Outstanding receivable</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatMoney(detail.outstanding, h.currency)}
            </dd>
          </>
        )}
      </dl>
      {h.notes && (
        <section>
          <h3 className="text-sm font-medium">Notes</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {h.notes}
          </p>
        </section>
      )}
      {h.void_reason && (
        <p className="rounded-lg border p-4 text-sm">
          Voided: {h.void_reason}. The original document is retained.
        </p>
      )}
      {h.state === "draft" && (
        <p className="text-sm text-muted-foreground">
          Draft only. No receivable has been posted.
        </p>
      )}
    </article>
  );
}
