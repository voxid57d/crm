import Link from "next/link";
import {
  getPayment,
  hasFinance,
  operationOptions,
} from "@/features/finance/operations-queries";
import {
  allocatePayment,
  refundPayment,
} from "@/features/finance/operations-actions";
import { financialDateTime as localDateTime } from "@/lib/time.mjs";
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
  const canRefund = hasFinance(w, "payments.refund", p.branch_id),
    refundOptions = canRefund
      ? await operationOptions("refund", p.branch_id)
      : null;
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
          ["Refunded", detail.refunded],
          ["Remaining refundable", detail.refundable],
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
      {canRefund && detail.refundable !== "0.00" && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Refund original payment</h2>
          <p className="text-sm text-muted-foreground">
            Available credit is refunded first. Further refunds release invoice
            allocations and reopen debt. You need allocation access to every
            affected invoice.
          </p>
          <ActionForm
            action={refundPayment}
            submit="Post refund"
            confirmation="Refund these funds and release invoice allocations where required?"
          >
            <OperationIdentity
              tenantId={w.tenant.id}
              fields={{ payment_id: id }}
            />
            <SelectField label="Refund cashbox" name="cashbox_id" required>
              <option value="">Choose cashbox</option>
              {refundOptions?.cashboxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
            <Field
              label="Refund amount (UZS)"
              name="amount"
              inputMode="decimal"
              maxLength={19}
              required
            />
            <Field
              label={`Refund date/time (${w.tenant.timezone})`}
              name="occurred_at"
              type="datetime-local"
              step="1"
              defaultValue={localDateTime(
                new Date().toISOString(),
                w.tenant.timezone,
              )}
              required
            />
            <Field
              label="Refund reason"
              name="reason"
              required
              minLength={3}
              maxLength={1000}
            />
            <FinancialConfirmation />
          </ActionForm>
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund history</h2>
        {detail.refunds.map((r) => (
          <article
            className="space-y-2 rounded-xl border bg-white p-4"
            key={r.id}
          >
            <p className="font-medium tabular-nums">
              {formatMoney(r.amount)} · {r.cashbox_name}
            </p>
            <p>{r.reason}</p>
            <p className="text-xs text-muted-foreground">
              {r.actor_name} · {financeDate(r.occurred_at, w.tenant.timezone)}
            </p>
          </article>
        ))}
        {!detail.refunds.length && (
          <p className="text-sm text-muted-foreground">
            No authorized refunds recorded.
          </p>
        )}
      </section>
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
