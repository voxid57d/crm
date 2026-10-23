import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { InvoiceLines } from "./invoice-lines";
import { saveInvoiceDraft } from "@/features/finance/invoice-actions";
import type { Invoice } from "@/features/finance/invoice-types";
export function InvoiceForm({
  tenantId,
  branchId,
  customers,
  selectedCustomer,
  today,
  invoice,
  copy,
  replacementId,
}: {
  tenantId: string;
  branchId: string;
  customers: { id: string; name: string; phone: string }[];
  selectedCustomer?: string;
  today: string;
  invoice?: Invoice;
  copy?: Invoice;
  replacementId?: string;
}) {
  return (
    <ActionForm
      action={saveInvoiceDraft}
      submit="Save invoice draft"
      className="space-y-6 rounded-xl border bg-white p-5 md:p-7"
    >
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      <input type="hidden" name="version" value={invoice?.version ?? 0} />
      <input
        type="hidden"
        name="replaces_invoice_id"
        value={invoice?.replaces_invoice_id ?? replacementId ?? ""}
      />
      {invoice && <input type="hidden" name="invoice_id" value={invoice.id} />}
      <SelectField
        name="customer_id"
        label="Customer"
        required
        defaultValue={invoice?.customer_id ?? selectedCustomer ?? ""}
      >
        <option value="" disabled>
          Choose a customer
        </option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.phone}
          </option>
        ))}
      </SelectField>
      {customers.length === 0 && (
        <p role="alert" className="text-sm text-destructive">
          No active authorized customers match. Change the customer search or
          branch, or create a customer in this branch first.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Issue date"
          name="issue_date"
          type="date"
          required
          defaultValue={invoice?.issue_date ?? today}
        />
        <Field
          label="Due date"
          name="due_date"
          type="date"
          required
          defaultValue={invoice?.due_date ?? today}
        />
      </div>
      <InvoiceLines initial={(invoice ?? copy)?.items} />
      <Field
        label="Invoice discount (UZS)"
        name="invoice_discount"
        inputMode="decimal"
        required
        maxLength={19}
        defaultValue={(invoice ?? copy)?.discount_amount ?? "0"}
      />
      <Field
        label="Notes (optional)"
        name="notes"
        maxLength={2000}
        defaultValue={(invoice ?? copy)?.notes}
      />
      <p className="text-sm text-muted-foreground">
        Currency: UZS. A draft creates no customer debt or cash movement.
        Issuing assigns the invoice number and locks its content.
      </p>
    </ActionForm>
  );
}
