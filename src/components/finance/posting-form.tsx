import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { postCashboxEntry } from "@/features/finance/actions";

export function PostingForm({
  tenantId,
  cashboxId,
  opening = false,
}: {
  tenantId: string;
  cashboxId: string;
  opening?: boolean;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">
        {opening ? "Opening balance" : "Balance adjustment"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {opening
          ? "Record the amount held before using this cashbox. An opening balance must be positive and must be the first posting. A new empty cashbox already starts at zero."
          : "Enter a positive amount to increase the balance or a negative amount to decrease it. A decrease cannot exceed the available balance. State the correction reason."}
      </p>
      <ActionForm
        action={postCashboxEntry}
        submit={opening ? "Post opening balance" : "Post adjustment"}
        confirmation="This posts an immutable financial movement. Confirm the amount and reason before continuing."
      >
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="cashbox_id" value={cashboxId} />
        <input type="hidden" name="request_id" value={randomUUID()} />
        <input
          type="hidden"
          name="kind"
          value={opening ? "opening_balance" : "adjustment"}
        />
        <Field
          label="Amount (UZS)"
          name="amount"
          inputMode="decimal"
          required
          maxLength={20}
          placeholder={opening ? "1000000.00" : "-10000.00"}
          autoComplete="off"
        />
        <Field
          label="Reason"
          name="reason"
          required
          minLength={3}
          maxLength={1000}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            name="confirm_posting"
            required
          />
          <span>
            I have checked the amount and reason. This posting will be retained
            in financial history.
          </span>
        </label>
      </ActionForm>
    </section>
  );
}
