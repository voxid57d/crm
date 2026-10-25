import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getAttendance } from "@/features/academics/attendance-queries";
import { prepareAttendance } from "@/features/academics/attendance-actions";
import { academicPage, academicDate } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import type { Json } from "@/lib/supabase/database.types";
import { AttendanceEditor } from "@/components/academics/attendance-editor";
import { ActionForm } from "@/components/forms/action-form";
import { FinancePagination } from "@/components/finance/pagination";
import { Badge } from "@/components/ui/badge";
export const metadata = { title: "Lesson attendance" };
function snapshot(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (
    <dl className="space-y-1 text-xs">
      {Object.entries(value)
        .filter(([k]) =>
          [
            "status",
            "notes",
            "late_minutes",
            "is_expected",
            "enrollment_id",
            "expected",
            "unmarked",
            "present",
            "late",
            "absent",
            "excused",
            "excluded",
            "state",
            "changed_records",
          ].includes(k),
        )
        .map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">{k.replaceAll("_", " ")}:</dt>
            <dd className="whitespace-pre-wrap break-words">
              {v === null ? "—" : String(v)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lesson: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const lesson = (await params).lesson,
    search = await searchParams,
    page = academicPage(search),
    hp = academicPage(search, "history_page"),
    { workspace: w, detail: d } = await getAttendance(lesson, page, hp),
    l = d.lesson,
    s = d.sheet,
    path = `/lessons/${lesson}/attendance`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm text-primary">
        <Link className="underline" href="/attendance">
          Attendance workspace
        </Link>
        <Link className="underline" href={`/lessons/${lesson}`}>
          Lesson details
        </Link>
        <Link
          className="underline"
          href={`/attendance/history?group=${l.group_id}&branch=`}
        >
          Group attendance history
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">
            {l.group_name} — attendance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {l.course_name} · {l.branch_name} ·{" "}
            {l.classroom_name ?? "Online / no room"}
          </p>
        </div>
        <Badge variant="outline">
          {s?.state ?? "Not prepared"} · Lesson {l.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <section className="space-y-2 rounded-xl border bg-white p-5 text-sm">
        <p>
          {academicDate(l.starts_at, l.timezone)} →{" "}
          {academicDate(l.ends_at, l.timezone)} · {l.timezone}
        </p>
        <p>
          Scheduled teacher: {l.teacher_name} · Teaching employee:{" "}
          {l.substitute_name ?? l.teacher_name}
        </p>
        <p>{l.title}</p>
        {l.notes && (
          <p className="whitespace-pre-wrap text-muted-foreground">{l.notes}</p>
        )}
      </section>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Attendance saved.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Unmarked means no attendance has been recorded; it is never
        automatically Absent. Enrollment dates and recorded pause/resume history
        determine the reviewed roster. No sensitive absence reason is required.
      </p>
      {l.status === "cancelled" || l.status === "rescheduled" ? (
        <p className="rounded-lg border bg-muted p-4 text-sm">
          This lesson retains any draft history and is excluded from regular
          attendance. Marks cannot be saved or finalized here.
        </p>
      ) : !s && !d.can_manage ? (
        <p className="text-sm text-muted-foreground">
          Roster preview only. Recording starts at the lesson start and requires
          permission for its actual teaching employee or authorized branch
          staff.
        </p>
      ) : null}
      <section className="flex flex-wrap gap-4 rounded-xl border bg-white p-5 text-sm">
        {Object.entries(d.counts).map(([k, v]) => (
          <p key={k}>
            <span className="capitalize text-muted-foreground">{k}</span>:{" "}
            <strong className="tabular-nums">{v}</strong>
          </p>
        ))}
      </section>
      {!s && d.can_manage && (
        <ActionForm
          action={prepareAttendance}
          submit="Prepare attendance sheet"
        >
          <input type="hidden" name="tenant_id" value={w.tenant.id} />
          <input type="hidden" name="lesson_id" value={lesson} />
          <input type="hidden" name="version" value="0" />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="request_id" value={randomUUID()} />
          <p className="text-sm text-muted-foreground">
            Prepare the reviewed roster with every student Unmarked. No
            attendance is assumed.
          </p>
        </ActionForm>
      )}
      <AttendanceEditor
        key={`${s?.version ?? 0}-${page}`}
        rows={d.rows}
        identity={{
          tenant_id: w.tenant.id,
          lesson_id: lesson,
          version: String(s?.version ?? 0),
          page: String(page),
        }}
        saveRequest={randomUUID()}
        finalizeRequest={randomUUID()}
        reviewRequest={randomUUID()}
        canManage={Boolean(s && d.can_manage)}
        canCorrect={Boolean(d.can_correct)}
        canFinalize={Boolean(d.can_finalize)}
        rosterChanged={d.roster_changed}
        unmarked={d.counts.unmarked}
        expected={d.counts.expected}
      />
      <FinancePagination
        path={path}
        filters={{ history_page: String(hp) }}
        page={page}
        total={d.total}
      />
      {s?.finalized_at && (
        <p className="text-sm text-muted-foreground">
          Finalized {academicDate(s.finalized_at, w.tenant.timezone)}.{" "}
          {s.correction_count} authorized correction batches. Frozen roster
          references remain even after transfers or withdrawals.
        </p>
      )}
      <section id="attendance-audit" className="space-y-4">
        <h2 className="text-xl font-semibold">Attendance audit history</h2>
        {d.history.rows.map((e) => (
          <article
            key={e.id}
            className="space-y-3 rounded-xl border bg-white p-4"
          >
            <p className="text-sm font-medium">
              {e.operation.replaceAll("_", " ")}
              {e.student_name ? ` · ${e.student_name}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.actor_name} · {academicDate(e.created_at, w.tenant.timezone)} ·
              Sheet version {e.sheet_version}
            </p>
            {e.reason && <p className="text-sm">{e.reason}</p>}
            <details>
              <summary className="cursor-pointer text-sm text-primary">
                Saved before and after
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium">Before</p>
                  {snapshot(e.before_data) ?? (
                    <p className="text-xs">Initial record</p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium">After</p>
                  {snapshot(e.after_data)}
                </div>
              </div>
            </details>
          </article>
        ))}
        {!d.history.rows.length && (
          <p className="text-sm text-muted-foreground">
            No saved attendance events on this page.
          </p>
        )}
        <FinancePagination
          path={path}
          filters={{ page: String(page) }}
          page={hp}
          total={d.history.total}
          pageKey="history_page"
          anchor="#attendance-audit"
        />
      </section>
    </div>
  );
}
