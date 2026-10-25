import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getGroup,
  lmsOptions,
  businessDate,
} from "@/features/academics/group-queries";
import { GroupForm } from "@/components/academics/delivery-forms";
export const metadata = { title: "Edit group" };
export default async function EditGroup({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { workspace: w, detail: d } = await getGroup((await params).group);
  if (
    !d.can_update ||
    ["completed", "cancelled", "archived"].includes(d.group.status)
  )
    notFound();
  const options = await lmsOptions();
  return (
    <div className="max-w-4xl space-y-6">
      <Link className="text-primary underline" href={`/groups/${d.group.id}`}>
        Group details
      </Link>
      <h1 className="text-3xl font-semibold">Edit group</h1>
      <GroupForm
        tenantId={w.tenant.id}
        group={d.group}
        branchId={d.group.branch_id}
        branchName={d.group.branch_name}
        options={options}
        today={businessDate(w)}
      />
    </div>
  );
}
