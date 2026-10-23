import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { canInvoice, businessDate } from "@/features/finance/invoice-queries";
import { financeFilters, value } from "@/features/finance/queries";
import type { FinanceSearch } from "@/features/finance/types";
import type { Invoice } from "@/features/finance/invoice-types";
import { InvoiceForm } from "./invoice-form";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { uuid } from "@/lib/validation.mjs";

export async function InvoiceEditor({
  search,
  invoice,
  copy,
}: {
  search: FinanceSearch;
  invoice?: Invoice;
  copy?: Invoice;
}) {
  const workspace = await getWorkspace();
  const branches = workspace.branches.filter(
    (b) => b.is_active && canInvoice(workspace, "invoices.create", b.id),
  );
  const filters = financeFilters(search, ["branch", "q", "customer"]);
  const branch =
    copy?.branch_id ||
    filters.branch ||
    invoice?.branch_id ||
    (branches.some((b) => b.id === workspace.branch?.id)
      ? workspace.branch?.id
      : branches[0]?.id);
  if (!branch)
    return (
      <p role="alert" className="rounded-xl border bg-white p-6">
        Your role cannot create invoice drafts in an active branch.
      </p>
    );
  if (!branches.some((b) => b.id === branch)) notFound();
  const result = await workspace.supabase.rpc("invoice_customer_choices", {
    p_tenant: workspace.tenant.id,
    p_branch: branch,
    p_search: (filters.q ?? "").slice(0, 100),
  });
  if (result.error) throw new Error("Invoice customer choices could not load.");
  const customers = result.data;
  const selected =
    copy?.customer_id || invoice?.customer_id || value(search, "customer");
  if (selected && !customers.some((c) => c.id === selected)) {
    try {
      uuid(selected);
    } catch {
      notFound();
    }
    const [customer, assignment] = await Promise.all([
      workspace.supabase
        .from("customers")
        .select("id,first_name,last_name,phone,archived_at")
        .eq("tenant_id", workspace.tenant.id)
        .eq("id", selected)
        .maybeSingle(),
      workspace.supabase
        .from("customer_branches")
        .select("branch_id")
        .eq("tenant_id", workspace.tenant.id)
        .eq("customer_id", selected)
        .eq("branch_id", branch),
    ]);
    if (customer.error || assignment.error)
      throw new Error("Customer selection could not load.");
    if (customer.data && !customer.data.archived_at && assignment.data.length)
      customers.unshift({
        id: selected,
        name: `${customer.data.first_name} ${customer.data.last_name}`.trim(),
        phone: customer.data.phone,
      });
  }
  return (
    <div className="space-y-6">
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-3">
        {copy ? (
          <>
            <input type="hidden" name="replacement" value={copy.id} />
            <p className="text-sm">Replacement branch: {copy.branch_name}</p>
          </>
        ) : (
          <SelectField
            label="Invoice branch"
            name="branch"
            defaultValue={branch}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
        )}
        {selected && <input type="hidden" name="customer" value={selected} />}
        <Field
          label="Search customer name or phone"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
        />
        <Button type="submit">Find customers</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Showing up to 20 matches plus the current authorized selection.
        Customers must belong to this branch. Shared contacts require your
        existing access in every assigned branch.
      </p>
      <InvoiceForm
        key={`${branch}:${filters.q ?? ""}:${selected}`}
        tenantId={workspace.tenant.id}
        branchId={branch}
        customers={customers}
        selectedCustomer={selected}
        today={businessDate(workspace.tenant.timezone)}
        invoice={invoice}
        copy={copy}
        replacementId={copy?.id}
      />
    </div>
  );
}
