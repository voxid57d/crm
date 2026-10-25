import Link from "next/link";
import {
  getGroup,
  enrollmentDirectory,
} from "@/features/academics/group-queries";
import { academicPage, academicDate } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroupStatusForm } from "@/components/academics/delivery-forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
import { EnrollmentList } from "@/components/academics/enrollment-list";
export const metadata = { title: "Group details" };
export default async function GroupProfile({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).group,
    search = await searchParams,
    hp = academicPage(search, "history_page"),
    rp = academicPage(search, "roster_page"),
    { workspace: w, detail: d } = await getGroup(id, hp),
    g = d.group,
    roster = d.can_roster
      ? await enrollmentDirectory(
          {
            group: id,
            page: String(rp),
            status:
              typeof search.roster_status === "string"
                ? search.roster_status
                : "all",
          },
          false,
        )
      : null;
  return (
    <div className="space-y-6">
      <Link href="/groups" className="text-primary underline">
        Groups
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{g.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {g.course_name} · {g.branch_name}
            {g.code ? ` · ${g.code}` : ""}
          </p>
        </div>
        <Badge variant="outline">{g.status}</Badge>
      </div>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Group saved.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {w.branchPermissions.get(g.branch_id)?.has("schedules.view") && (
          <Button asChild variant="outline">
            <Link href={`/groups/${id}/schedules`}>Weekly schedules</Link>
          </Button>
        )}
        {w.branchPermissions.get(g.branch_id)?.has("lessons.view") && (
          <>
            <Button asChild variant="outline">
              <Link href={`/lessons?group=${id}`}>Group lessons</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/timetable?group=${id}`}>Group timetable</Link>
            </Button>
          </>
        )}
        {w.branchPermissions.get(g.branch_id)?.has("lessons.manage") &&
          ["planned", "active"].includes(g.status) && (
            <Button asChild variant="outline">
              <Link href={`/lessons/new?group=${id}`}>
                Add individual lesson
              </Link>
            </Button>
          )}
        {d.can_update &&
          !["completed", "cancelled", "archived"].includes(g.status) && (
            <Button asChild variant="outline">
              <Link href={`/groups/${id}/edit`}>Edit group</Link>
            </Button>
          )}
        {d.can_assign &&
          !["completed", "cancelled", "archived"].includes(g.status) && (
            <Button asChild variant="outline">
              <Link href={`/groups/${id}/teachers`}>Assign teachers</Link>
            </Button>
          )}
        {d.can_enroll && ["planned", "active"].includes(g.status) && (
          <Button asChild>
            <Link href={`/groups/${id}/enroll`}>Enroll student</Link>
          </Button>
        )}
      </div>
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Group information</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Course", g.course_name + (!d.course_active ? " (archived)" : "")],
            ["Period", `${g.start_date} → ${g.end_date ?? "Open"}`],
            ["Reserved seats", `${d.counts.reserved_seats} / ${g.capacity}`],
            ["Active enrollments", String(d.counts.active_enrollments)],
            ["Unique active students", String(d.counts.unique_students)],
            ["Historical enrollments", String(d.counts.historical_enrollments)],
            [
              "Classroom",
              g.classroom_name
                ? g.classroom_name +
                  (d.classroom_active === false ? " (inactive)" : "")
                : "No physical classroom / online",
            ],
            ["Created", academicDate(g.created_at, w.tenant.timezone)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Pending, active and paused enrollments reserve seats. Counts reflect
          real records in this group. Weekly plans and individual lessons are
          managed separately; no billing or attendance is created by scheduling.
        </p>
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Teachers</h2>
        {g.teachers.length ? (
          <ul className="space-y-2 text-sm">
            {g.teachers.map((e) => (
              <li key={e.employee_id}>
                {e.name}
                {e.is_primary ? " · Primary" : " · Additional"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No teachers assigned.</p>
        )}
        {d.teacher_history.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-primary">
              Assignment history and eligibility
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {d.teacher_history.map((a) => (
                <li key={a.id}>
                  {a.name} · {a.is_primary ? "Primary" : "Additional"} ·{" "}
                  {academicDate(a.assigned_at, w.tenant.timezone)} →{" "}
                  {a.ended_at
                    ? academicDate(a.ended_at, w.tenant.timezone)
                    : "Current"}
                  {!a.ended_at && !a.eligible
                    ? " · No longer eligible; review assignment"
                    : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section id="roster" className="space-y-4">
        <h2 className="text-xl font-semibold">
          Student roster and enrollment history
        </h2>
        {roster ? (
          <EnrollmentList
            rows={roster.rows}
            total={roster.total}
            page={rp}
            path={`/groups/${id}`}
            filters={{ history_page: String(hp) }}
            pageKey="roster_page"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Enrollment access is restricted.
          </p>
        )}
      </section>
      {(d.can_update || d.can_archive) && (
        <GroupStatusForm
          tenantId={w.tenant.id}
          group={g}
          canArchive={d.can_archive}
          canUpdate={d.can_update}
        />
      )}{" "}
      {d.can_update && (
        <AcademicHistoryPanel
          title="Group history"
          history={d.history}
          zone={w.tenant.timezone}
          path={`/groups/${id}`}
          page={hp}
        />
      )}
    </div>
  );
}
