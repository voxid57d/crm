import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSlot,
  schedulingOptions,
} from "@/features/academics/scheduling-queries";
import { businessDate } from "@/features/academics/group-queries";
import { academicPage } from "@/features/academics/queries";
import { weekdays } from "@/features/academics/scheduling-types";
import type { AcademicSearch } from "@/features/academics/types";
import {
  ScheduleForm,
  EndScheduleForm,
} from "@/components/academics/scheduling-forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
export const metadata = { title: "Weekly schedule period" };
export default async function ScheduleDetails({
  params,
  searchParams,
}: {
  params: Promise<{ group: string; slot: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const p = await params,
    search = await searchParams,
    page = academicPage(search, "history_page"),
    { workspace: w, detail: d } = await getSlot(p.slot, page),
    s = d.slot;
  if (s.group_id !== p.group) notFound();
  const options = d.can_revise ? await schedulingOptions(s.group_id) : null;
  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href={`/groups/${s.group_id}/schedules`}
        className="text-primary underline"
      >
        Weekly schedules
      </Link>
      <h1 className="text-3xl font-semibold">
        {weekdays[s.weekday - 1]} · {s.start_time.slice(0, 5)}–
        {s.end_time.slice(0, 5)}
      </h1>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Schedule saved. Existing lesson records were retained.
        </p>
      )}
      <section className="space-y-3 rounded-xl border bg-white p-5 text-sm">
        <p>
          {s.group_name} · {s.branch_name}
        </p>
        <p>
          {s.effective_from} → {s.effective_to} · {s.timezone}
        </p>
        <p>
          {s.teacher_name}
          {!d.teacher_eligible
            ? " · No longer eligible; review the next period"
            : ""}{" "}
          · {s.classroom_name ?? "Online / no room"}
        </p>
        <p>
          {d.future_lessons} future scheduled lessons already exist in this
          series. Revisions and ending a period leave those lessons unchanged;
          review them separately.
        </p>
        <Link
          href={`/lessons?group=${s.group_id}`}
          className="inline-block text-primary underline"
        >
          Review group lessons
        </Link>
        {s.replaces_id && (
          <p>
            Previous period:{" "}
            <Link
              className="text-primary underline"
              href={`/groups/${s.group_id}/schedules/${s.replaces_id}`}
            >
              View retained source
            </Link>
          </p>
        )}
        {d.replacement_id && (
          <p>
            Next period:{" "}
            <Link
              className="text-primary underline"
              href={`/groups/${s.group_id}/schedules/${d.replacement_id}`}
            >
              View revision
            </Link>
          </p>
        )}
      </section>
      {options && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">
              Revise future weekly teaching
            </h2>
            <ScheduleForm
              tenantId={w.tenant.id}
              options={options}
              slot={s}
              today={businessDate(w)}
              zone={s.timezone}
            />
          </section>
          <EndScheduleForm
            tenantId={w.tenant.id}
            slot={s}
            today={businessDate(w)}
          />
        </>
      )}
      <AcademicHistoryPanel
        title="Schedule history"
        history={d.history}
        zone={w.tenant.timezone}
        path={`/groups/${s.group_id}/schedules/${s.id}`}
        page={page}
      />
    </div>
  );
}
