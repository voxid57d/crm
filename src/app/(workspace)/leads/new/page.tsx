import { salesOptions } from "@/features/sales/queries";
import { saveLead } from "@/features/sales/actions";
import { LeadFields } from "@/components/sales/fields";
import { ActionForm } from "@/components/forms/action-form";
import { SalesNavigation } from "@/components/sales/navigation";
export const metadata = { title: "Add lead" };
export default async function NewLead() {
  const options = await salesOptions(),
    { workspace } = options;
  const branches = workspace.branches.filter(
    (b) =>
      b.is_active &&
      workspace.branchPermissions.get(b.id)?.has("leads.create") &&
      workspace.branchPermissions.get(b.id)?.has("leads.view"),
  );
  if (!branches.length)
    return (
      <p role="alert">
        Lead creation permission in an active branch is required.
      </p>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SalesNavigation />
      <h1 className="text-3xl font-semibold">Add lead</h1>
      <p className="text-sm text-muted-foreground">
        Enter a manual enquiry. Email is optional; original phone formatting is
        preserved.
      </p>
      <div className="rounded-xl border bg-white p-5 sm:p-7">
        <ActionForm
          action={saveLead}
          submit="Create lead"
          className="space-y-6"
        >
          <LeadFields
            tenantId={workspace.tenant.id}
            pipelines={options.pipelines}
            stages={options.stages}
            sources={options.sources}
            employeeChoices={options.employeeChoices}
            branches={branches}
            defaultBranch={workspace.branch?.id}
            canAssign={workspace.permissions.has("leads.assign")}
          />
        </ActionForm>
      </div>
    </div>
  );
}
