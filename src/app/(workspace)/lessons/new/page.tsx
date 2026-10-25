import Link from "next/link";
import { notFound } from "next/navigation";
import {
  timetableOptions,
  schedulingOptions,
} from "@/features/academics/scheduling-queries";
import { businessDate } from "@/features/academics/group-queries";
import { LessonForm } from "@/components/academics/scheduling-forms";
import { SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Add lesson" };
export default async function NewLesson({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const search = await searchParams,
    all = await timetableOptions(),
    groups = all.groups.filter((g) => g.can_create),
    group =
      groups.find((g) => g.id === search.group) ??
      (!search.group
        ? (groups.find((g) => g.branch_id === all.workspace.branch?.id) ??
          groups[0])
        : undefined);
  if (!group) notFound();
  const options = await schedulingOptions(group.id),
    w = options.workspace;
  if (!options.can_lesson) notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/lessons" className="text-primary underline">
        Lesson directory
      </Link>
      <h1 className="text-3xl font-semibold">Add individual lesson</h1>
      <form className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Authorized group"
          name="group"
          defaultValue={group.id}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
        <Button variant="outline">Choose group</Button>
      </form>
      <LessonForm
        tenantId={w.tenant.id}
        options={options}
        today={businessDate(w)}
        zone={w.tenant.timezone}
      />
    </div>
  );
}
