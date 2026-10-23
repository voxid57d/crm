import Link from "next/link";
import { getLead } from "@/features/sales/queries";
import { saveLead } from "@/features/sales/actions";
import { LeadFields } from "@/components/sales/fields";
import { ActionForm } from "@/components/forms/action-form";
export const metadata = { title: "Edit lead" };
export default async function EditLead({
  params,
}: {
  params: Promise<{ lead: string }>;
}) {
  const { lead: id } = await params;
  const record = await getLead(id),
    { workspace, lead } = record;
  if (
    lead.archived_at ||
    lead.status === "converted" ||
    !workspace.branchPermissions.get(lead.branch_id)?.has("leads.update")
  )
    return (
      <p role="alert">
        Editing is unavailable for your role or this lead.{" "}
        <Link href={`/leads/${id}`} className="underline">
          Back to lead
        </Link>
      </p>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Edit lead</h1>
      <div className="rounded-xl border bg-white p-5 sm:p-7">
        <ActionForm action={saveLead} submit="Save lead" className="space-y-6">
          <LeadFields
            tenantId={workspace.tenant.id}
            lead={lead}
            pipelines={record.pipelines}
            stages={record.stages}
            sources={record.sources}
            employeeChoices={record.employeeChoices}
            branches={workspace.branches.filter(
              (b) =>
                b.is_active &&
                workspace.branchPermissions.get(b.id)?.has("leads.update"),
            )}
            canAssign={
              workspace.branchPermissions
                .get(lead.branch_id)
                ?.has("leads.assign") ?? false
            }
          />
        </ActionForm>
      </div>
    </div>
  );
}
