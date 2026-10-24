import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { saveCategory } from "@/features/finance/operations-actions";
import type { ExpenseCategory } from "@/features/finance/operations-types";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import {
  OperationIdentity,
  FinancialConfirmation,
} from "@/components/finance/operation-fields";
export const metadata = { title: "Expense categories" };
export default async function Page() {
  const w = await getWorkspace();
  if (!w.businessPermissions.has("expenses.manage")) notFound();
  const r = await w.supabase.rpc("expense_category_directory", {
    p_tenant: w.tenant.id,
  });
  if (r.error) throw new Error("Categories could not load.");
  const categories = r.data as unknown as ExpenseCategory[];
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Expense categories</h1>
      <p className="text-sm text-muted-foreground">
        Deactivation prevents new expenses. Existing expenses retain their
        recorded category name.
      </p>
      {[undefined, ...categories].map((c) => (
        <ActionForm
          key={c?.id ?? "new"}
          action={saveCategory}
          submit={c ? "Save category" : "Create category"}
          className="space-y-4 rounded-xl border bg-white p-5"
        >
          <OperationIdentity
            tenantId={w.tenant.id}
            fields={{
              category_id: c?.id ?? "",
              version: String(c?.version ?? 0),
            }}
          />
          <Field
            label={c ? "Category name" : "New category name"}
            name="name"
            defaultValue={c?.name}
            required
            maxLength={100}
          />
          <SelectField
            label="Status"
            name="is_active"
            defaultValue={c?.is_active === false ? "false" : "true"}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </SelectField>
          <FinancialConfirmation />
        </ActionForm>
      ))}
    </div>
  );
}
