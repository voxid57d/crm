import Link from "next/link";
import { getPayment, hasFinance } from "@/features/finance/operations-queries";
import { allocatePayment } from "@/features/finance/operations-actions";
import { formatMoney } from "@/features/finance/money.mjs";
import { financeDate } from "@/features/finance/queries";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import {
  OperationIdentity,
  FinancialConfirmation,
} from "@/components/finance/operation-fields";
export const metadata = { title: "Payment history" };
export default async function PaymentProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { workspace: w, detail } = await getPayment(id),
    p = detail.payment,
    canAllocate = hasFinance(w, "payments.allocate", p.branch_id);
  return (
    <div className="space-y-6">
      <Link className="text-primary underline" href="/finance/payments">
        All payments
      </Link>
      <h1 className="text-3xl font-semibold">Payment from {p.customer_name}</h1>
      <p className="text-sm text-muted-foreground">
        {financeDate(p.paid_at, w.tenant.timezone)} · {p.cashbox_name} ·{" "}
        {p.method.replaceAll("_", " ")} · Recorded by {p.actor_name}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Received", p.amount],
          ["Net allocated", p.allocated],
          ["Available customer credit", p.credit],
        ].map(([label, n]) => (
          <div className="space-y-3 rounded-xl border bg-white p-5" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="break-words text-xl font-semibold tabular-nums">
              {formatMoney(n, p.currency)}
            </p>
          </div>
        ))}
      </div>
      {p.external_reference && (
        <p className="text-sm">Reference: {p.external_reference}</p>
      )}
      {p.notes && <p className="whitespace-pre-wrap text-sm">{p.notes}</p>}
      {canAllocate && detail.invoices.length > 0 && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Allocate existing credit</h2>
          <ActionForm action={allocatePayment} submit="Allocate credit">
            <OperationIdentity
              tenantId={w.tenant.id}
              fields={{ payment_id: id }}
            />
            <SelectField label="Outstanding invoice" name="invoice_id" required>
              <option value="">Choose invoice</option>
              {detail.invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoice_number} · {formatMoney(i.outstanding)}
                </option>
              ))}
            </SelectField>
            <Field
              label="Allocate (UZS)"
              name="amount"
              inputMode="decimal"
              required
              maxLength={19}
            />
            <Field label="Reason (optional)" name="reason" maxLength={1000} />
            <FinancialConfirmation />
          </ActionForm>
        </section>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Allocation history</h2>
        <p className="text-sm text-muted-foreground">
          Only authorized invoice details are shown. Releasing an allocation
          restores credit and reopens debt without changing cash.
        </p>
        {detail.allocations.map((a) => (
          <article
            className="space-y-3 rounded-xl border bg-white p-5"
            key={a.id}
          >
            <div className="flex flex-wrap justify-between gap-4">
              <Link
                className="text-primary underline"
                href={`/finance/invoices/${a.invoice_id}`}
              >
                {a.invoice_number}
              </Link>
              <span className="font-medium tabular-nums">
                {formatMoney(a.amount)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {a.actor_name} · {financeDate(a.created_at, w.tenant.timezone)}
              {a.reason ? ` · ${a.reason}` : ""}
            </p>
            {canAllocate && !a.reversal_of && a.remaining !== "0.00" && (
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Release allocation
                </summary>
                <ActionForm
                  action={allocatePayment}
                  submit="Release allocation"
                  confirmation="Release this allocation and reopen the corresponding invoice debt?"
                  className="mt-4 space-y-4"
                >
                  <OperationIdentity
                    tenantId={w.tenant.id}
                    fields={{
                      payment_id: id,
                      invoice_id: a.invoice_id,
                      original: a.id,
                    }}
                  />
                  <Field
                    label="Release amount (UZS)"
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={a.remaining}
                    maxLength={19}
                  />
                  <Field
                    label="Release reason"
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                  <FinancialConfirmation />
                </ActionForm>
              </details>
            )}
          </article>
        ))}
        {!detail.allocations.length && (
          <p className="text-sm text-muted-foreground">
            No visible allocations have been posted.
          </p>
        )}
      </section>
    </div>
  );
}
