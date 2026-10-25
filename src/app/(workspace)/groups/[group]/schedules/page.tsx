import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroup, businessDate } from "@/features/academics/group-queries";
import {
  scheduleDirectory,
  generationBatch,
} from "@/features/academics/scheduling-queries";
import { weekdays } from "@/features/academics/scheduling-types";
import { academicDate, queryValue } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { GenerationForm } from "@/components/academics/scheduling-forms";
import { SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
import { addDays } from "@/features/academics/calendar.mjs";
export const metadata = { title: "Weekly group schedules" };
export default async function Schedules({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).group,
    search = await searchParams,
    { workspace: w, detail: d } = await getGroup(id),
    directory = await scheduleDirectory(id, search),
    manage = Boolean(
      w.branchPermissions.get(d.group.branch_id)?.has("schedules.manage"),
    ),
    batchId = queryValue(search, "batch"),
    batch = batchId ? await generationBatch(batchId) : null;
  if (batch && batch.group_id !== id) notFound();
  const today = businessDate(w),
    from = d.group.start_date > today ? d.group.start_date : today,
    to =
      d.group.end_date && d.group.end_date < addDays(from, 6)
        ? d.group.end_date
        : addDays(from, 6);
  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-primary underline">
        Group details
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Weekly schedules · {d.group.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Each period retains its local weekday, time and timezone. Generate
            lessons to display them in the timetable.
          </p>
        </div>
        {manage && ["planned", "active"].includes(d.group.status) && (
          <Button asChild>
            <Link href={`/groups/${id}/schedules/new`}>Add weekly slot</Link>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-primary">
        <Link className="underline" href={`/groups/${id}/schedules/exceptions`}>
          One-off occurrence exceptions
        </Link>
        <Link className="underline" href={`/lessons?group=${id}`}>
          Group lessons
        </Link>
        <Link className="underline" href={`/timetable?group=${id}`}>
          Group timetable
        </Link>
      </div>
      {batch && (
        <div
          role="status"
          className="space-y-2 rounded-xl border bg-secondary p-5 text-sm"
        >
          <p className="font-medium">
            Lesson generation complete · {batch.from_date} → {batch.to_date}
          </p>
          <p>
            {batch.created_count} created · {batch.existing_count} existing
            occurrences retained · {batch.past_count} past starts skipped ·{" "}
            {batch.closure_count} closure skips · {batch.exception_count}{" "}
            occurrence exceptions
          </p>
          <Link
            className="text-primary underline"
            href={`/scheduling/generation/${batch.id}`}
          >
            View retained generation receipt and skip details
          </Link>
          <p>{academicDate(batch.created_at, w.tenant.timezone)}</p>
        </div>
      )}
      <form className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Schedule periods"
          name="status"
          defaultValue={directory.status}
        >
          <option value="current">Current and upcoming</option>
          <option value="all">All history</option>
        </SelectField>
        <Button variant="outline">Apply filter</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Weekly schedule periods</caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                "Weekday / time",
                "Effective dates",
                "Teacher / room",
                "State",
              ].map((h) => (
                <th key={h} className="p-4 font-medium" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {directory.rows.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="min-w-48 p-4">
                  <Link
                    href={`/groups/${id}/schedules/${s.id}`}
                    className="font-medium text-primary underline"
                  >
                    {weekdays[s.weekday - 1]} · {s.start_time.slice(0, 5)}–
                    {s.end_time.slice(0, 5)}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.timezone}
                  </p>
                </td>
                <td className="whitespace-nowrap p-4">
                  {s.effective_from} → {s.effective_to}
                </td>
                <td className="p-4">
                  {s.teacher_name}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.classroom_name ?? "Online / no room"}
                  </p>
                </td>
                <td className="p-4">
                  {s.is_active ? "Period retained" : "Stopped before start"}
                </td>
              </tr>
            ))}
            {!directory.rows.length && (
              <tr>
                <td
                  colSpan={4}
                  className="p-8 text-center text-muted-foreground"
                >
                  No schedule periods match. Add a weekly slot for each teaching
                  weekday/time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        path={`/groups/${id}/schedules`}
        filters={{ status: directory.status }}
        page={directory.page}
        total={directory.total}
      />
      {manage &&
        w.branchPermissions.get(d.group.branch_id)?.has("lessons.manage") &&
        ["planned", "active"].includes(d.group.status) &&
        to >= from && (
          <GenerationForm
            tenantId={w.tenant.id}
            groupId={id}
            from={from}
            to={to}
          />
        )}
    </div>
  );
}
