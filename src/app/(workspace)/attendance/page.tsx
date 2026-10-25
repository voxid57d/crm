import Link from "next/link";
import { attendanceDirectory } from "@/features/academics/attendance-queries";
import { academicDate } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { AttendanceFilters } from "@/components/academics/attendance-filters";
import { FinancePagination } from "@/components/finance/pagination";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Attendance workspace" };
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
  } = await attendanceDirectory(await searchParams);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Attendance workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {w.tenant.name} · {w.tenant.timezone}. Open a lesson to review its
            roster, save marks and finalize attendance.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/attendance/history">Attendance history</Link>
        </Button>
      </div>
      <nav
        aria-label="Attendance workspace views"
        className="flex flex-wrap gap-4 text-sm text-primary"
      >
        {[
          ["today", "Today"],
          ["upcoming", "Upcoming"],
          ["awaiting", "Awaiting attendance"],
          ["recent", "Recently completed"],
          ["all", "All lessons"],
        ].map(([v, n]) => (
          <Link
            key={v}
            className="underline"
            href={`/attendance?${new URLSearchParams({ view: v, branch: filters.branch ?? "" })}`}
          >
            {n}
          </Link>
        ))}
      </nav>
      {options.my_employee_id && (
        <section className="space-y-2 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Your assigned groups</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {options.assigned_groups.map((g) => (
              <Link
                key={g.id}
                className="text-primary underline"
                href={`/groups/${g.id}`}
              >
                {g.name}
              </Link>
            ))}
            {!options.assigned_groups.length && (
              <p className="text-muted-foreground">
                No current eligible group assignments.
              </p>
            )}
            <Link
              className="text-primary underline"
              href={`/groups?teacher=${options.my_employee_id}&branch=`}
            >
              All your groups
            </Link>
          </div>
        </section>
      )}
      <AttendanceFilters workspace={w} options={options} filters={filters} />
      <p className="text-sm text-muted-foreground">
        Missing and draft sheets remain incomplete, not automatic absences.
        Cancelled/rescheduled lessons appear only in All lessons and retain any
        draft history. Finalized attendance is separate from lesson delivery.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {d.rows.map((l) => (
          <article
            key={l.id}
            className="space-y-3 rounded-xl border bg-white p-5"
          >
            <h2 className="font-semibold">
              <Link
                className="text-primary underline"
                href={`/lessons/${l.id}/attendance`}
              >
                {l.group_name} · {l.title}
              </Link>
            </h2>
            <p className="text-sm">
              {l.course_name} · {l.branch_name} ·{" "}
              {l.classroom_name ?? "Online / no room"}
            </p>
            <p className="text-sm">
              {academicDate(l.starts_at, w.tenant.timezone)} →{" "}
              {academicDate(l.ends_at, w.tenant.timezone)}
            </p>
            <p className="text-sm">Teaching employee: {l.teacher_name}</p>
            <p className="text-sm text-muted-foreground">
              Lesson {l.status.replaceAll("_", " ")} · Attendance{" "}
              {l.attendance_state ?? "not prepared"}
              {l.expected !== null
                ? ` · ${l.expected} expected · ${l.unmarked} unmarked`
                : ""}
            </p>
            <Button asChild variant="outline">
              <Link href={`/lessons/${l.id}/attendance`}>Open attendance</Link>
            </Button>
          </article>
        ))}
        {!d.rows.length && (
          <p className="rounded-xl border bg-white p-8 text-sm text-muted-foreground lg:col-span-2">
            No authorized lessons match this view and date range. Use the
            existing group schedule to generate lessons or adjust the filters.
          </p>
        )}
      </div>
      <FinancePagination
        path="/attendance"
        filters={filters}
        page={page}
        total={d.total}
      />
    </div>
  );
}
