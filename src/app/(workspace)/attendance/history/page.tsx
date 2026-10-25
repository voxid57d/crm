import Link from "next/link";
import { attendanceDirectory } from "@/features/academics/attendance-queries";
import { academicDate } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { AttendanceFilters } from "@/components/academics/attendance-filters";
import { FinancePagination } from "@/components/finance/pagination";
export const metadata = { title: "Attendance history" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const {
    workspace: w,
    options,
    filters,
    page,
    data: d,
  } = await attendanceDirectory(await searchParams, true);
  return (
    <div className="space-y-6">
      <Link className="text-sm text-primary underline" href="/attendance">
        Attendance workspace
      </Link>
      <h1 className="text-3xl font-semibold">Attendance history</h1>
      <p className="text-sm text-muted-foreground">
        Saved student marks and reviewed roster entries. Draft, Unmarked,
        cancelled/rescheduled and excluded entries are labeled; none imply a
        completed absence. Use a lesson&apos;s audit history for prior corrected
        values. Attendance rates and exports follow in 8D.
      </p>
      <AttendanceFilters
        workspace={w}
        options={options}
        filters={filters}
        history
      />
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Authorized student attendance history
          </caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                "Student",
                "Lesson / course / group",
                "Date / teacher / branch",
                "Mark / sheet",
                "Optional note",
              ].map((h) => (
                <th key={h} scope="col" className="p-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="min-w-44 p-4">
                  {r.student_name}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.student_identifier}
                  </p>
                  {r.can_open_student && (
                    <Link
                      className="mt-2 block text-xs text-primary underline"
                      href={`/students/${r.customer_id}`}
                    >
                      Student profile
                    </Link>
                  )}
                </td>
                <td className="p-4">
                  <Link
                    className="text-primary underline"
                    href={`/lessons/${r.lesson_id}/attendance`}
                  >
                    {r.group_name}
                  </Link>
                  <p className="mt-1 text-xs">{r.course_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lesson {r.lesson_status.replaceAll("_", " ")}
                  </p>
                </td>
                <td className="p-4">
                  {academicDate(r.starts_at, w.tenant.timezone)}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.teacher_name} · {r.branch_name}
                  </p>
                </td>
                <td className="p-4 capitalize">
                  {r.status}
                  {r.late_minutes ? ` (${r.late_minutes} min)` : ""}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.sheet_state}
                    {!r.is_expected ? " · Excluded roster entry" : ""}
                  </p>
                </td>
                <td className="max-w-80 whitespace-pre-wrap break-words p-4">
                  {r.notes || "—"}
                </td>
              </tr>
            ))}
            {!d.rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-muted-foreground"
                >
                  No saved attendance entries match these authorized filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <FinancePagination
        path="/attendance/history"
        filters={filters}
        page={page}
        total={d.total}
      />
    </div>
  );
}
