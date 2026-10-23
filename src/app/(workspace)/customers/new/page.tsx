import { customerOptions } from "@/features/customers/queries";
import { saveCustomer } from "@/features/customers/actions";
import { CustomerFields } from "@/components/customers/fields";
import { DuplicateChecker } from "@/components/customers/duplicate-checker";
import { ActionForm } from "@/components/forms/action-form";

export const metadata = { title: "Add customer" };
export default async function NewCustomer() {
  const options = await customerOptions();
  const { workspace } = options;
  if (
    !workspace.permissions.has("customers.create") ||
    !workspace.permissions.has("customers.view")
  )
    return (
      <p role="alert">
        Customer creation and viewing permissions are required.
      </p>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Add customer</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Create one contact for your business. Add an optional student profile
          and guardian relationships without copying personal details.
        </p>
      </div>
      <DuplicateChecker tenantId={workspace.tenant.id} />
      <div className="rounded-xl border bg-white p-5 sm:p-7">
        <ActionForm
          action={saveCustomer}
          submit="Create customer"
          className="space-y-6"
        >
          <CustomerFields
            options={options}
            branchIds={workspace.branch ? [workspace.branch.id] : []}
          />
        </ActionForm>
      </div>
    </div>
  );
}
