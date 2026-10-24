import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { getInvoice } from "@/features/finance/invoice-queries";
import { hasFinance } from "@/features/finance/operations-queries";
import { value } from "@/features/finance/queries";
import { uuid } from "@/lib/validation.mjs";
import { localDateTime } from "@/lib/time.mjs";
import { postPayment } from "@/features/finance/operations-actions";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  OperationIdentity,
  FinancialConfirmation,
} from "@/components/finance/operation-fields";
import { AllocationFields } from "@/components/finance/allocation-fields";
import type { FinanceSearch } from "@/features/finance/types";
import type { PaymentOptions } from "@/features/finance/operations-types";
export const metadata = { title: "Record payment" };
export default async function NewPayment({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const search = await searchParams,
    w = await getWorkspace(),
    source = value(search, "invoice");
  const invoice = source ? (await getInvoice(source)).detail.invoice : null;
  const branches = w.branches.filter(
    (b) =>
      b.is_active &&
      hasFinance(w, "payments.view", b.id) &&
      hasFinance(w, "payments.create", b.id),
  );
  const branch =
    invoice?.branch_id ||
    value(search, "branch") ||
    (branches.some((b) => b.id === w.branch?.id)
      ? w.branch?.id
      : branches[0]?.id);
  if (!branch)
    return <p role="alert">No active branch allows you to record payments.</p>;
  if (!branches.some((b) => b.id === branch)) notFound();
  const customer = invoice?.customer_id || value(search, "customer");
  if (customer) uuid(customer);
  const r = await w.supabase.rpc("finance_payment_options", {
    p_tenant: w.tenant.id,
    p_branch: branch,
    ...(customer ? { p_customer: customer } : {}),
    p_search: value(search, "q").slice(0, 100),
  });
  if (r.error) throw new Error("Payment form could not load.");
  const options = r.data as unknown as PaymentOptions;
  const selected = options.customers.find((c) => c.id === customer);
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-3xl font-semibold">Record payment</h1>
      <p className="text-sm text-muted-foreground">
        Record received funds once. Invoice allocations reduce debt; the unused
        amount remains customer credit.
      </p>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <SelectField label="Payment branch" name="branch" defaultValue={branch}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Find customer"
          name="q"
          defaultValue={value(search, "q")}
          maxLength={100}
        />
        <SelectField
          label="Customer"
          name="customer"
          defaultValue={customer || ""}
        >
          <option value="">Choose customer</option>
          {options.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.phone}
            </option>
          ))}
        </SelectField>
        <Button type="submit">Load customer</Button>
      </form>
      {selected ? (
        <ActionForm
          action={postPayment}
          submit="Post payment"
          confirmation="Post this payment and its allocations? Review the received amount and date."
          className="space-y-5 rounded-xl border bg-white p-6"
        >
          <OperationIdentity
            tenantId={w.tenant.id}
            fields={{ branch_id: branch, customer_id: selected.id }}
          />
          <p className="font-medium">Receiving from {selected.name}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Received amount (UZS)"
              name="amount"
              inputMode="decimal"
              required
              maxLength={19}
            />
            <SelectField label="Receiving cashbox" name="cashbox_id" required>
              <option value="">Choose cashbox</option>
              {options.cashboxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.branch_id ? "" : " (business-wide)"}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Payment method"
              name="method"
              defaultValue="cash"
            >
              {["cash", "bank_transfer", "card_terminal", "other"].map((m) => (
                <option key={m} value={m}>
                  {m.replaceAll("_", " ")}
                </option>
              ))}
            </SelectField>
            <Field
              label={`Received at (${w.tenant.timezone})`}
              name="occurred_at"
              type="datetime-local"
              required
              defaultValue={localDateTime(
                new Date().toISOString(),
                w.tenant.timezone,
              )}
            />
            <Field
              label="External reference (optional)"
              name="external_reference"
              maxLength={150}
            />
            <Field label="Notes (optional)" name="notes" maxLength={2000} />
          </div>
          <AllocationFields
            invoices={options.invoices}
            selected={invoice?.id}
          />
          <FinancialConfirmation />
        </ActionForm>
      ) : (
        <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
          Choose a customer and load the payment form. Search shows up to 20
          matches plus a verified current selection.
        </p>
      )}
    </div>
  );
}
