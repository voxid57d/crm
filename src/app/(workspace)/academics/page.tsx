import Link from "next/link";
import { academicReport } from "@/features/academics/integration-queries";
import type { AcademicSearch } from "@/features/academics/types";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FinancePagination } from "@/components/finance/pagination";
export const metadata = { title: "Academic overview" };
const labels: Record<string, string> = {
  active_courses: "Active offered courses",
  active_groups: "Active groups",
  unique_active_students: "Unique active students",
  active_enrollments: "Active enrollments",
  teachers: "Eligible assigned teachers",
  today_lessons: "Today's lessons",
  upcoming_lessons: "Upcoming lessons",
  completed_lessons: "Completed lessons",
  near_capacity: "Groups near capacity",
  at_capacity: "Groups at capacity",
  available_classrooms: "Active classrooms",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const {
    workspace: w,
    report: d,
    options,
    filters: f,
    page,
  } = await academicReport(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Academic overview</h1>
      <p className="text-sm text-muted-foreground">
        {w.tenant.name} · {w.tenant.timezone}. Live, authorized academic records
        across the selected filters.
      </p>
      <form
        action="/academics"
        className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SelectField label="Branch" name="branch" defaultValue={f.branch || ""}>
          <option value="">All authorized branches</option>
          {w.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Course" name="course" defaultValue={f.course || ""}>
          <option value="">All offered courses</option>
          {options.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Teacher"
          name="teacher"
          defaultValue={f.teacher || ""}
        >
          <option value="">All authorized teachers</option>
          {options.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Capacity report"
          name="capacity"
          defaultValue={f.capacity || "all"}
        >
          <option value="all">All groups</option>
          <option value="near">Near capacity (80–99%)</option>
          <option value="full">At capacity</option>
        </SelectField>
        <Field
          label="From"
          name="from"
          type="date"
          required
          defaultValue={f.from}
        />
        <Field
          label="Through"
          name="to"
          type="date"
          required
          defaultValue={f.to}
        />
        <Button type="submit" variant="outline">
          Apply academic filters
        </Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(d.stats).map(([key, value]) => (
          <Card key={key} className="shadow-none">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{labels[key]}</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <details className="rounded-xl border bg-white p-5 text-sm">
        <summary className="cursor-pointer font-medium">
          How these numbers are counted
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            Group and enrollment effective dates overlap the inclusive selected
            range (at most 366 dates). Active students are distinct original
            Student Profiles with active enrollments; one student in several
            groups is counted once. Courses are active catalog entries offered
            through planned, active or paused authorized groups, rather than
            unused catalog entries.
          </p>
          <p>
            Teachers count current eligible assignments; a teacher filter
            selects current group assignments and the actual teaching employee
            for lesson totals, including substitutes. Lesson totals use concrete
            records in the selected range. Today uses the business timezone;
            upcoming means scheduled after now; completed counts retained
            completed lessons.
          </p>
          <p>
            Reserved seats include pending, active and paused enrollments. Near
            capacity is at least 80% but below full. Counts and seats require
            enrollment access; inaccessible records are excluded. Active
            classrooms are configured rooms in active authorized branches, not a
            free-time availability calculation. Course/teacher filters restrict
            classroom counts to branches of matching groups.
          </p>
          <p>
            The capacity selector filters the group report; metric cards retain
            the branch/course/teacher/date scope. Group status is its current
            state; this report does not reconstruct historic state as of a past
            date.
          </p>
        </div>
      </details>
      <section id="group-report" className="space-y-4">
        <h2 className="text-xl font-semibold">
          Group capacity and enrollment report
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Academic group report</caption>
            <thead className="bg-muted/50">
              <tr>
                {[
                  "Group / course",
                  "Branch / teachers",
                  "Status",
                  "Reserved / capacity",
                  "Active enrollments",
                ].map((h) => (
                  <th key={h} scope="col" className="p-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="p-4">
                    <Link
                      className="text-primary underline"
                      href={`/groups/${g.id}`}
                    >
                      {g.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.course_name}
                    </p>
                  </td>
                  <td className="p-4">
                    {g.branch_name}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.teachers || "No assigned teachers"}
                    </p>
                  </td>
                  <td className="p-4">{g.status}</td>
                  <td className="p-4 tabular-nums">
                    {g.reserved_seats === null
                      ? "Restricted"
                      : `${g.reserved_seats} / ${g.capacity}`}
                  </td>
                  <td className="p-4 tabular-nums">
                    {g.active_enrollments ?? "Restricted"}
                  </td>
                </tr>
              ))}
              {!d.rows.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No authorized groups match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          path="/academics"
          filters={f}
          page={page}
          total={d.total}
          anchor="#group-report"
        />
      </section>
    </div>
  );
}
