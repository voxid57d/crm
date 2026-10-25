import Link from "next/link";
import { notFound } from "next/navigation";
import { schedulingOptions } from "@/features/academics/scheduling-queries";
import { businessDate } from "@/features/academics/group-queries";
import { ScheduleForm } from "@/components/academics/scheduling-forms";
export const metadata = { title: "Add weekly schedule" };
export default async function NewSchedule({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const id = (await params).group,
    options = await schedulingOptions(id),
    w = options.workspace;
  if (
    !options.can_schedule ||
    !["planned", "active"].includes(options.group.status)
  )
    notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <Link className="text-primary underline" href={`/groups/${id}/schedules`}>
        Weekly schedules
      </Link>
      <h1 className="text-3xl font-semibold">
        Add weekly slot · {options.group.name}
      </h1>
      {!options.teachers.length && (
        <p className="text-sm text-muted-foreground">
          Assign an eligible employee teacher to this group before creating its
          schedule.
        </p>
      )}
      <ScheduleForm
        tenantId={w.tenant.id}
        options={options}
        today={businessDate(w)}
        zone={w.tenant.timezone}
      />
    </div>
  );
}
