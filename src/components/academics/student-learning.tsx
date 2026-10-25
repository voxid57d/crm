import Link from "next/link";
import { getWorkspace } from "@/features/workspace/context";
import {
  studentAcademicSummary,
  studentLessons,
} from "@/features/academics/integration-queries";
import { businessDate } from "@/features/academics/group-queries";
import { academicPage, academicDate } from "@/features/academics/queries";
import { addDays } from "@/features/academics/calendar.mjs";
import type { AcademicSearch } from "@/features/academics/types";
import { lessonStatuses } from "@/features/academics/scheduling-types";
import { LessonList } from "./lesson-list";
import { LinkedInvoices } from "./linked-invoices";
import { FinancePagination } from "@/components/finance/pagination";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export async function StudentLearning({
  student,
  path,
  search,
}: {
  student: string;
  path: string;
  search: AcademicSearch;
}) {
  const w = await getWorkspace(),
    activityPage = academicPage(search, "academic_page"),
    invoicePage = academicPage(search, "academic_invoice_page"),
    summary = await studentAcademicSummary(student, activityPage, invoicePage),
    lessonSearch = {
      from: search.lesson_from || addDays(businessDate(w), -30),
      to: search.lesson_to || addDays(businessDate(w), 30),
      status: search.lesson_status || "all",
      page: search.lesson_page || "0",
    },
    lessons = await studentLessons(student, lessonSearch);
  const lessonFilters = {
    lesson_from: lessons.filters.from,
    lesson_to: lessons.filters.to,
    lesson_status: lessons.filters.status || "all",
  };
  return (
    <>
      <section id="lessons" className="space-y-4 md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Student lessons and timetable
          </h2>
          <Button asChild variant="outline">
            <Link href={`/students/${student}/timetable`}>
              Student timetable
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {summary.active_courses} current active courses ·{" "}
          {summary.active_groups} current active groups ·{" "}
          {summary.historical_enrollments} retained enrollments. Counts and
          lessons include only your authorized academic records.
        </p>
        <p className="text-sm text-muted-foreground">
          Upcoming and past lessons follow enrollment dates and expected
          rosters. Pending and paused enrollments are excluded from uncaptured
          rosters. This is an expected schedule, not attendance history.
        </p>
        <form
          action={path + "#lessons"}
          className="flex flex-wrap items-end gap-3"
        >
          <Field
            label="Lessons from"
            name="lesson_from"
            type="date"
            required
            defaultValue={lessons.filters.from}
          />
          <Field
            label="Lessons through"
            name="lesson_to"
            type="date"
            required
            defaultValue={lessons.filters.to}
          />
          <SelectField
            label="Lesson status"
            name="lesson_status"
            defaultValue={lessonFilters.lesson_status}
          >
            <option value="all">All statuses</option>
            {lessonStatuses.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </SelectField>
          <Button type="submit" variant="outline">
            Filter student lessons
          </Button>
        </form>
        <LessonList
          rows={lessons.rows}
          total={lessons.total}
          page={lessons.page}
          path={path}
          filters={lessonFilters}
          zone={w.tenant.timezone}
          pageKey="lesson_page"
          anchor="#lessons"
        />
      </section>
      <section
        id="enrollment-charges"
        className="space-y-4 rounded-xl border bg-white p-5 md:col-span-2"
      >
        <h2 className="text-xl font-semibold">Linked enrollment charges</h2>
        <p className="text-sm text-muted-foreground">
          Authorized invoices linked to this student&apos;s enrollments. The
          Finance section retains the full contact invoice, payment, debt and
          credit history. A guardian is not automatically the invoice debtor or
          payer.
        </p>
        <LinkedInvoices rows={summary.invoices.rows} />
        <FinancePagination
          path={path}
          filters={{}}
          pageKey="academic_invoice_page"
          anchor="#enrollment-charges"
          page={invoicePage}
          total={summary.invoices.total}
        />
      </section>
      <section
        id="academic-activity"
        className="space-y-4 rounded-xl border bg-white p-5 md:col-span-2"
      >
        <h2 className="text-xl font-semibold">Academic activity</h2>
        <p className="text-sm text-muted-foreground">
          Enrollment, transfer and relevant lesson events. Private tuition,
          administrative notes and scheduling reasons are available only in
          their separately protected detail views.
        </p>
        {summary.activity.rows.map((a) => (
          <article key={a.id} className="space-y-1 border-b pb-3 text-sm">
            <p className="font-medium">{a.operation.replaceAll("_", " ")}</p>
            <p>
              {a.group_name} · {academicDate(a.created_at, w.tenant.timezone)}
            </p>
            <Link
              className="text-primary underline"
              href={
                a.lesson_id
                  ? `/lessons/${a.lesson_id}`
                  : `/enrollments/${a.enrollment_id}`
              }
            >
              View academic record
            </Link>
          </article>
        ))}
        {!summary.activity.rows.length && (
          <p className="text-sm text-muted-foreground">
            No authorized academic activity on this page.
          </p>
        )}
        <FinancePagination
          path={path}
          filters={{}}
          pageKey="academic_page"
          anchor="#academic-activity"
          page={activityPage}
          total={summary.activity.total}
        />
      </section>
      <section
        id="attendance"
        className="space-y-3 rounded-xl border bg-white p-5 md:col-span-2"
      >
        <h2 className="text-xl font-semibold">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Core attendance is available from each authorized lesson and the
          Attendance workspace. Student Profile attendance summaries and rates
          are planned for 8D. Lesson completion does not mark attendance.
        </p>
        <Link
          className="text-sm text-primary underline"
          href={`/attendance/history?student=${student}&branch=`}
        >
          View authorized attendance history
        </Link>
      </section>
    </>
  );
}
