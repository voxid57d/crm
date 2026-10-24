import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import {
  operationOptions,
  hasFinance,
} from "@/features/finance/operations-queries";
import {
  postExpense,
  postTransfer,
} from "@/features/finance/operations-actions";
import { financialDateTime as localDateTime } from "@/lib/time.mjs";
import { value } from "@/features/finance/queries";
import type { FinanceSearch } from "@/features/finance/types";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { OperationIdentity, FinancialConfirmation } from "./operation-fields";
export async function NewOperation({
  kind,
  search,
}: {
  kind: "expense" | "transfer";
  search: FinanceSearch;
}) {
  const w = await getWorkspace(),
    branches = w.branches.filter(
      (b) =>
        b.is_active &&
        hasFinance(w, "expenses.view", b.id) &&
        hasFinance(w, "expenses.create", b.id),
    );
  const branch =
    value(search, "branch") ||
    (branches.some((b) => b.id === w.branch?.id)
      ? w.branch?.id
      : branches[0]?.id);
  if (kind === "expense" && !branch)
    return (
      <p role="alert">No active authorized expense branch is available.</p>
    );
  if (kind === "expense" && !branches.some((b) => b.id === branch)) notFound();
  const options = await operationOptions(
    kind,
    kind === "expense" ? branch : undefined,
  );
  const choices = options.cashboxes.map((b) => (
    <option value={b.id} key={b.id}>
      {b.name} ·{" "}
      {w.branches.find((br) => br.id === b.branch_id)?.name ?? "Business-wide"}
    </option>
  ));
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">
        {kind === "expense" ? "Record expense" : "Transfer funds"}
      </h1>
      {kind === "expense" && (
        <form className="flex items-end gap-4">
          <SelectField
            label="Expense branch"
            name="branch"
            defaultValue={branch}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
          <Button variant="outline">Choose branch</Button>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        {kind === "expense"
          ? "Record an actual business expense. Attach an optional receipt after saving."
          : "Move funds between two authorized cashboxes in the same currency. Both movements post together."}
      </p>
      <ActionForm
        action={kind === "expense" ? postExpense : postTransfer}
        submit={kind === "expense" ? "Post expense" : "Post transfer"}
        confirmation="Post this financial operation?"
        className="space-y-5 rounded-xl border bg-white p-6"
      >
        <OperationIdentity
          tenantId={w.tenant.id}
          fields={kind === "expense" ? { branch_id: branch! } : {}}
        />
        <SelectField
          label={kind === "expense" ? "Paying cashbox" : "Source cashbox"}
          name={kind === "expense" ? "cashbox_id" : "source_id"}
          required
        >
          <option value="">Choose cashbox</option>
          {choices}
        </SelectField>
        {kind === "transfer" ? (
          <SelectField
            label="Destination cashbox"
            name="destination_id"
            required
          >
            <option value="">Choose cashbox</option>
            {choices}
          </SelectField>
        ) : (
          <>
            <SelectField label="Expense category" name="category_id" required>
              <option value="">Choose category</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <Field label="Vendor (optional)" name="vendor" maxLength={150} />
          </>
        )}
        <Field
          label="Amount (UZS)"
          name="amount"
          required
          inputMode="decimal"
          maxLength={19}
        />
        <Field
          label={`Effective date/time (${w.tenant.timezone})`}
          name="occurred_at"
          type="datetime-local"
          step="1"
          required
          defaultValue={localDateTime(
            new Date().toISOString(),
            w.tenant.timezone,
          )}
        />
        <Field
          label={kind === "expense" ? "Description" : "Transfer reason"}
          name="reason"
          minLength={3}
          maxLength={1000}
          required
        />
        <FinancialConfirmation />
      </ActionForm>
    </div>
  );
}
