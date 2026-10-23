import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { canInvoice } from "@/features/finance/invoice-queries";
import type { getWorkspace } from "@/features/workspace/context";
export function InvoiceFilters({
  workspace,
  filters,
  debts = false,
}: {
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  filters: Record<string, string>;
  debts?: boolean;
}) {
  return (
    <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      <Field
        label="Search customer or invoice number"
        name="q"
        defaultValue={filters.q}
        maxLength={100}
      />
      <SelectField
        label="Branch"
        name="branch"
        defaultValue={filters.branch ?? ""}
      >
        <option value="">All authorized branches</option>
        {workspace.branches
          .filter((b) =>
            canInvoice(workspace, debts ? "debts.view" : "invoices.view", b.id),
          )
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.is_active ? "" : " (inactive)"}
            </option>
          ))}
      </SelectField>
      {filters.customer && (
        <input type="hidden" name="customer" value={filters.customer} />
      )}
      {!debts && (
        <>
          <SelectField
            label="Status"
            name="status"
            defaultValue={filters.status ?? ""}
          >
            <option value="">All statuses</option>
            {["draft", "issued", "overdue", "voided", "discarded"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Sort"
            name="sort"
            defaultValue={filters.sort ?? "newest"}
          >
            <option value="newest">Newest</option>
            <option value="due">Due date</option>
            <option value="total">Highest invoice total</option>
          </SelectField>
        </>
      )}
      <Button type="submit">Apply filters</Button>
    </form>
  );
}
