import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { businessDate } from "@/features/academics/group-queries";
import {
  lessonDirectory,
  timetableOptions,
} from "@/features/academics/scheduling-queries";
import { calendarPeriod } from "@/features/academics/calendar.mjs";
import { queryValue } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import {
  Timetable,
  CalendarPagination,
} from "@/components/academics/timetable";
import { LessonFilters } from "@/components/academics/lesson-filters";
import { Button } from "@/components/ui/button";
import { closureDirectory } from "@/features/academics/calendar-queries";
export const metadata = { title: "Academic timetable" };
export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const search = await searchParams,
    w = await getWorkspace(),
    date = queryValue(search, "date") || businessDate(w),
    view = queryValue(search, "view") || "week";
  let period: ReturnType<typeof calendarPeriod>;
  try {
    period = calendarPeriod(date, view);
  } catch {
    notFound();
  }
  if (
    !Object.hasOwn(search, "teacher") &&
    !w.permissions.has("lessons.manage") &&
    w.permissions.has("groups.view_assigned")
  )
    search.teacher = "me";
  const [d, options] = await Promise.all([
    lessonDirectory({ ...search, from: period.from, to: period.to }, true),
    timetableOptions(),
  ]);
  const filters: Record<string, string> = { ...d.filters, date, view };
  delete filters.from;
  delete filters.to;
  const closureBranch =
    d.filters.branch ||
    options.groups.find((g) => g.id === d.filters.group)?.branch_id ||
    "";
  const closures = await closureDirectory(
    {
      from: period.from,
      to: period.to,
      branch: closureBranch,
      closure_page: search.closure_page,
    },
    true,
  );
  const periodHref = (dateValue: string) =>
    "/timetable?" +
    new URLSearchParams({ ...filters, date: dateValue, page: "0" });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Timetable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {period.from} → {period.to} · {w.tenant.timezone}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/lessons">Lesson directory</Link>
          </Button>
          {options.groups.some((g) => g.can_create) && (
            <Button asChild>
              <Link href="/lessons/new">Add lesson</Link>
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Shows individual and generated lessons. Weekly plans also reserve
        resources; generate lessons from a group&apos;s schedule to display
        those occurrences here. Cancelled and rescheduled records are labeled
        when included by the status filter.
      </p>
      <LessonFilters
        workspace={w}
        options={options}
        filters={d.filters}
        calendar
        view={view}
        date={date}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href={periodHref(period.previous)}>Previous period</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={periodHref(businessDate(w))}>Today</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={periodHref(period.next)}>Next period</Link>
        </Button>
      </div>
      <CalendarPagination
        filters={filters}
        page={d.page}
        total={d.total}
        size={d.page_size}
      />
      <p className="text-sm text-muted-foreground">
        {closures.total} authorized active non-teaching periods overlap this
        view. Calendar badges show up to 200 per closure page. Existing lesson
        events are retained for explicit review.{" "}
        <Link className="text-primary underline" href="/scheduling/closures">
          Open non-teaching calendar
        </Link>
      </p>
      {closures.total > 200 && (
        <div className="flex gap-4 text-sm text-primary">
          {closures.page > 0 && (
            <Link
              className="underline"
              href={`/timetable?${new URLSearchParams({ ...filters, closure_page: String(closures.page - 1) })}`}
            >
              Previous closure page
            </Link>
          )}
          {(closures.page + 1) * 200 < closures.total && (
            <Link
              className="underline"
              href={`/timetable?${new URLSearchParams({ ...filters, closure_page: String(closures.page + 1) })}`}
            >
              Next closure page
            </Link>
          )}
        </div>
      )}
      <Timetable
        days={period.days}
        rows={d.rows}
        zone={w.tenant.timezone}
        view={view}
        closures={closures.rows}
      />
    </div>
  );
}
