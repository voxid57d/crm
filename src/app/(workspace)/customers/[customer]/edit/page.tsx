import Link from "next/link";
import { getCustomer } from "@/features/customers/queries";
import { allScopes } from "@/features/workspace/context";
import { saveCustomer } from "@/features/customers/actions";
import { CustomerFields } from "@/components/customers/fields";
import { DuplicateChecker } from "@/components/customers/duplicate-checker";
import { ActionForm } from "@/components/forms/action-form";

export const metadata = { title: "Edit customer" };
export default async function EditCustomer({
  params,
}: {
  params: Promise<{ customer: string }>;
}) {
  const { customer: id } = await params;
  const record = await getCustomer(id);
  const { workspace, customer, student, branchIds, tagIds, values } = record;
  if (
    customer.archived_at ||
    !allScopes(workspace, branchIds, "customers.update")
  )
    return (
      <p role="alert">
        Editing is unavailable. Restore the customer and verify permissions.{" "}
        <Link href={`/customers/${id}`} className="underline">
          Back to profile
        </Link>
      </p>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Edit customer</h1>
      <DuplicateChecker
        tenantId={workspace.tenant.id}
        customerId={id}
        phone={customer.phone}
        email={customer.email ?? ""}
        name={`${customer.first_name} ${customer.last_name}`}
      />
      <div className="rounded-xl border bg-white p-5 sm:p-7">
        <ActionForm
          action={saveCustomer}
          submit="Save customer"
          className="space-y-6"
        >
          <CustomerFields
            options={record}
            customer={customer}
            student={student}
            branchIds={branchIds}
            tagIds={tagIds}
            values={values}
          />
        </ActionForm>
      </div>
    </div>
  );
}
