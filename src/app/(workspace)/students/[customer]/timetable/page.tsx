import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudent } from "@/features/customers/queries";
import { studentLessons } from "@/features/academics/integration-queries";
import { businessDate } from "@/features/academics/group-queries";
import { calendarPeriod } from "@/features/academics/calendar.mjs";
import { queryValue } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { lessonStatuses } from "@/features/academics/scheduling-types";
import {
  Timetable,
  CalendarPagination,
} from "@/components/academics/timetable";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Student timetable" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ customer: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const student = (await params).customer,
    search = await searchParams,
    { workspace: w, customer: c } = await getStudent(student),
    date = queryValue(search, "date") || businessDate(w),
    view = queryValue(search, "view") || "week";
  let period: ReturnType<typeof calendarPeriod>;
  try {
    period = calendarPeriod(date, view);
  } catch {
    notFound();
  }
  const d = await studentLessons(
      student,
      { ...search, from: period.from, to: period.to },
      true,
    ),
    path = `/students/${student}/timetable`,
    filters = { date, view, status: d.filters.status || "all" };
  const href = (value: string) =>
    path + "?" + new URLSearchParams({ ...filters, date: value });
  return (
    <div className="space-y-6">
      <Link
        className="text-primary underline"
        href={`/students/${student}#lessons`}
      >
        Back to student profile
      </Link>
      <h1 className="text-3xl font-semibold">
        {c.first_name} {c.last_name} — timetable
      </h1>
      <p className="text-sm text-muted-foreground">
        {period.from} → {period.to} · {w.tenant.timezone}. Authorized lessons
        within enrollment dates or retained expected rosters. Ungenerated weekly
        plans and attendance marks do not appear.
      </p>
      <form className="flex flex-wrap items-end gap-3" action={path}>
        <Field
          label="Calendar date"
          name="date"
          type="date"
          required
          defaultValue={date}
        />
        <SelectField label="Calendar view" name="view" defaultValue={view}>
          {["day", "week", "month"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Lesson status"
          name="status"
          defaultValue={filters.status}
        >
          <option value="all">All statuses</option>
          {lessonStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={href(period.previous)}>Previous period</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={href(businessDate(w))}>Today</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={href(period.next)}>Next period</Link>
        </Button>
      </div>
      <CalendarPagination
        path={path}
        filters={filters}
        page={d.page}
        total={d.total}
        size={d.page_size}
      />
      <Timetable
        days={period.days}
        rows={d.rows}
        zone={w.tenant.timezone}
        view={view}
      />
    </div>
  );
}
