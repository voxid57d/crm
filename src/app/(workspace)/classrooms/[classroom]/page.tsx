import Link from "next/link";
import {
  getClassroom,
  academicPage,
  academicDate,
} from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { AcademicStateForm } from "@/components/academics/forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Classroom profile" };
export default async function ClassroomProfile({
  params,
  searchParams,
}: {
  params: Promise<{ classroom: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).classroom,
    search = await searchParams,
    page = academicPage(search, "history_page"),
    { workspace: w, detail: d } = await getClassroom(id, page),
    r = d.classroom;
  return (
    <div className="space-y-6">
      <Link href="/classrooms" className="text-primary underline">
        All classrooms
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{r.name}</h1>
          <div className="mt-3 flex flex-wrap gap-3">
            <Badge variant={r.is_active ? "secondary" : "outline"}>
              {r.is_active ? "Active" : "Inactive"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {r.branch_name}
              {d.branch_active ? "" : " · Branch inactive"}
            </span>
          </div>
        </div>
        {d.can_manage && (
          <Button asChild variant="outline">
            <Link href={`/classrooms/${id}/edit`}>Edit classroom</Link>
          </Button>
        )}
      </div>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Classroom saved.
        </p>
      )}
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Room information</h2>
        <p className="text-lg font-medium tabular-nums">
          Capacity: {r.capacity}
        </p>
        <p className="whitespace-pre-wrap text-sm">
          {r.description || "No description provided."}
        </p>
        <p className="text-xs text-muted-foreground">
          Created {academicDate(r.created_at, w.tenant.timezone)} · Last
          modified {academicDate(r.updated_at, w.tenant.timezone)}
        </p>
        <p className="text-sm text-muted-foreground">
          Branch identity is fixed. Deactivation retains this room and its
          references.
        </p>
      </section>
      <section className="space-y-2 rounded-xl border border-dashed p-5">
        <h2 className="font-semibold">Classroom schedule</h2>
        <p className="text-sm text-muted-foreground">
          Review individual and generated lessons in the timetable. Weekly plans
          also reserve resources before generation; availability is checked when
          scheduling a lesson.
        </p>
        {w.branchPermissions.get(r.branch_id)?.has("schedules.view") && (
          <Link
            href={`/timetable?classroom=${id}&branch=${r.branch_id}`}
            className="inline-block text-sm text-primary underline"
          >
            View classroom timetable
          </Link>
        )}
      </section>
      {d.can_manage && (
        <>
          <AcademicStateForm
            tenantId={w.tenant.id}
            kind="classroom"
            id={id}
            version={r.version}
            active={r.is_active}
          />
          <AcademicHistoryPanel
            history={d.history}
            zone={w.tenant.timezone}
            path={`/classrooms/${id}`}
            page={page}
          />
        </>
      )}
    </div>
  );
}
