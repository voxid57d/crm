import { notFound } from "next/navigation";
import {
  lmsOptions,
  branchGrant,
  businessDate,
} from "@/features/academics/group-queries";
import { GroupForm } from "@/components/academics/delivery-forms";
import { SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Add group" };
export default async function NewGroup({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; course?: string }>;
}) {
  const search = await searchParams,
    options = await lmsOptions(),
    w = options.workspace,
    branches = w.branches.filter(
      (b) =>
        b.is_active &&
        branchGrant(w, "groups.view", b.id) &&
        branchGrant(w, "groups.create", b.id),
    ),
    branch =
      branches.find((b) => b.id === (search.branch ?? w.branch?.id)) ??
      (!search.branch ? branches[0] : undefined);
  if (!branch) notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Add group</h1>
      <form className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Branch for new group"
          name="branch"
          defaultValue={branch.id}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <Button variant="outline">Choose branch</Button>
      </form>
      <GroupForm
        tenantId={w.tenant.id}
        branchId={branch.id}
        branchName={branch.name}
        options={options}
        today={businessDate(w)}
        courseId={search.course}
      />
    </div>
  );
}
