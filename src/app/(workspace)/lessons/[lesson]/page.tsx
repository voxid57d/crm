import Link from "next/link";
import {
  getLesson,
  expectedRoster,
} from "@/features/academics/scheduling-queries";
import { academicPage, academicDate } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { LessonStatusForm } from "@/components/academics/scheduling-forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
import { lessonCalendarContext } from "@/features/academics/calendar-queries";
export const metadata = { title: "Lesson details" };
export default async function LessonProfile({
  params,
  searchParams,
}: {
  params: Promise<{ lesson: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).lesson,
    search = await searchParams,
    page = academicPage(search, "history_page"),
    rp = academicPage(search, "roster_page"),
    { workspace: w, detail: d } = await getLesson(id, page),
    l = d.lesson,
    roster = d.can_roster ? await expectedRoster(id, rp) : null;
  const attendance = await w.supabase.rpc("can_view_attendance", {
    p_tenant: w.tenant.id,
    p_lesson: id,
  });
  if (attendance.error)
    throw new Error(
      "Attendance access could not load. Check local migrations and services.",
    );
  const calendar = await lessonCalendarContext(id);
  return (
    <div className="space-y-6">
      <Link href="/lessons" className="text-primary underline">
        Lessons
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{l.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {l.group_name} · {l.course_name} · {l.branch_name}
          </p>
        </div>
        <Badge variant="outline">{l.status.replaceAll("_", " ")}</Badge>
      </div>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Lesson saved.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {attendance.data && (
          <Button asChild variant="outline">
            <Link href={`/lessons/${id}/attendance`}>Attendance sheet</Link>
          </Button>
        )}
        {d.can_open_group && (
          <Button asChild variant="outline">
            <Link href={`/groups/${l.group_id}`}>Group and enrollments</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/timetable?group=${l.group_id}`}>Timetable</Link>
        </Button>
        {d.can_edit && (
          <>
            <Button asChild variant="outline">
              <Link href={`/lessons/${id}/edit`}>Edit lesson details</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/lessons/${id}/reschedule`}>Reschedule lesson</Link>
            </Button>
          </>
        )}
      </div>
      <section className="space-y-5 rounded-xl border bg-white p-5">
        {calendar.blocked && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p>
              This retained lesson overlaps an active non-teaching period.
              Review it explicitly; new or moved bookings cannot overlap the
              closure.
            </p>
            {calendar.closures.map((c) => (
              <p key={c.id}>
                <Link
                  className="underline"
                  href={`/scheduling/closures/${c.id}`}
                >
                  {c.name} · {c.from_date} → {c.to_date} · {c.timezone}
                </Link>
              </p>
            ))}
          </div>
        )}
        {calendar.cancellation && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <h2 className="font-semibold">Cancellation record</h2>
            <p>
              {calendar.cancellation.by} ·{" "}
              {academicDate(calendar.cancellation.at, w.tenant.timezone)} ·
              Previous status: {calendar.cancellation.previous_status}
            </p>
            <p>{calendar.cancellation.reason}</p>
          </div>
        )}
        {calendar.has_finalized_attendance && (
          <p className="text-sm text-muted-foreground">
            Finalized attendance is retained. This lesson cannot be cancelled or
            rescheduled through ordinary scheduling actions.
          </p>
        )}
        <h2 className="text-xl font-semibold">Lesson information</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Start", academicDate(l.starts_at, l.timezone)],
            ["End", academicDate(l.ends_at, l.timezone)],
            ["Timezone", l.timezone],
            ["Scheduled group teacher", l.teacher_name],
            ["Actual teaching employee", l.substitute_name ?? l.teacher_name],
            ["Classroom", l.classroom_name ?? "Online / no physical room"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        {!d.teacher_eligible && (
          <p className="text-sm text-destructive">
            The assigned teaching employee is no longer eligible. Review future
            teaching assignments.
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm">
          {l.notes || "No lesson notes."}
        </p>
        {l.schedule_slot_id && d.can_open_group && (
          <p className="text-sm">
            Generated occurrence {l.occurrence_date}.{" "}
            <Link
              className="text-primary underline"
              href={`/groups/${l.group_id}/schedules/${l.schedule_slot_id}`}
            >
              Original weekly period
            </Link>
          </p>
        )}
        {l.rescheduled_from_id && (
          <p className="text-sm">
            Rescheduled from{" "}
            <Link
              className="text-primary underline"
              href={`/lessons/${l.rescheduled_from_id}`}
            >
              Retained source lesson
            </Link>
            .
          </p>
        )}
        {d.replacement_id && (
          <p className="text-sm">
            Replacement:{" "}
            <Link
              className="text-primary underline"
              href={`/lessons/${d.replacement_id}`}
            >
              Open new lesson
            </Link>
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Expected student roster</h2>
        {roster ? (
          <>
            <p className="text-sm text-muted-foreground">
              {roster.captured_at
                ? `Captured ${academicDate(roster.captured_at, w.tenant.timezone)}.`
                : "Preview based on current enrollment status and effective dates; saved when the lesson starts or completes."}{" "}
              This is the lesson&apos;s expected list, not attendance.
              Attendance uses a separately reviewed historical enrollment
              roster.
            </p>
            <ul className="space-y-2 rounded-xl border bg-white p-5">
              {roster.rows.map((s) => (
                <li
                  key={s.enrollment_id}
                  className="flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <span>
                    {s.name} · {s.student_identifier}
                  </span>
                  {s.can_open_student && (
                    <Link
                      className="text-primary underline"
                      href={`/students/${s.customer_id}`}
                    >
                      Student profile
                    </Link>
                  )}
                </li>
              ))}
              {!roster.rows.length && (
                <li className="text-sm text-muted-foreground">
                  No expected students on this page.
                </li>
              )}
            </ul>
            <Pagination
              path={`/lessons/${id}`}
              filters={{ history_page: String(page) }}
              page={rp}
              total={roster.total}
              pageKey="roster_page"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Expected roster access is restricted.
          </p>
        )}
      </section>
      <LessonStatusForm
        tenantId={w.tenant.id}
        detail={{
          ...d,
          can_cancel: d.can_cancel && !calendar.has_finalized_attendance,
        }}
      />
      <AcademicHistoryPanel
        title="Lesson history"
        history={d.history}
        zone={w.tenant.timezone}
        path={`/lessons/${id}`}
        page={page}
      />
    </div>
  );
}
