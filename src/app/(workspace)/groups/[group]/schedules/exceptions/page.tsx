import Link from "next/link";
import { getGroup, businessDate } from "@/features/academics/group-queries";
import { scheduleDirectory } from "@/features/academics/scheduling-queries";
import {
  exceptionDirectory,
  exceptionHistory,
} from "@/features/academics/calendar-queries";
import { academicPage } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { ExceptionForm } from "@/components/academics/calendar-forms";
import { FinancePagination } from "@/components/finance/pagination";
import { AcademicHistoryPanel } from "@/components/academics/history";
export const metadata = { title: "Weekly occurrence exceptions" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const group = (await params).group,
    search = await searchParams,
    page = academicPage(search),
    { workspace: w, detail: d } = await getGroup(group),
    slots = await scheduleDirectory(group, {
      status: "all",
      page: typeof search.slot_page === "string" ? search.slot_page : "0",
    }),
    exceptions = await exceptionDirectory(group, page),
    canManage = Boolean(
      w.branchPermissions.get(d.group.branch_id)?.has("schedules.manage"),
    ),
    path = `/groups/${group}/schedules/exceptions`;
  const hp = academicPage(search, "history_page"),
    audit =
      typeof search.history === "string"
        ? await exceptionHistory(group, search.history, hp)
        : null;
  return (
    <div className="space-y-6">
      <Link
        className="text-primary underline"
        href={`/groups/${group}/schedules`}
      >
        Weekly schedules
      </Link>
      <h1 className="text-3xl font-semibold">
        Occurrence exceptions · {d.group.name}
      </h1>
      <p className="text-sm text-muted-foreground">
        Skip or restore one weekly series/date. Permanent timetable changes
        remain effective schedule revisions. Already generated lessons require
        explicit individual review.
      </p>
      {canManage && slots.rows.length > 0 && (
        <ExceptionForm
          tenant={w.tenant.id}
          group={group}
          slots={slots.rows}
          date={businessDate(w)}
        />
      )}
      {slots.total > 20 && (
        <FinancePagination
          path={path}
          filters={{ page: String(page) }}
          pageKey="slot_page"
          page={academicPage(search, "slot_page")}
          total={slots.total}
        />
      )}
      {!slots.rows.length && (
        <p className="text-sm text-muted-foreground">
          Add a weekly slot before creating an occurrence exception.
        </p>
      )}
      {exceptions.rows.map((e) => (
        <section
          key={e.id}
          className="space-y-3 rounded-xl border bg-white p-5"
        >
          <h2 className="font-semibold">
            {e.occurrence_date} ·{" "}
            {e.is_active ? "Weekly occurrence skipped" : "Normal weekly plan"}
          </h2>
          <p className="text-sm">{e.reason}</p>
          <Link
            className="text-sm text-primary underline"
            href={`${path}?history=${e.id}&page=${page}`}
          >
            View exception audit
          </Link>
          {e.lesson_id && (
            <Link
              className="text-sm text-primary underline"
              href={`/lessons/${e.lesson_id}`}
            >
              Review retained generated lesson
            </Link>
          )}
          {canManage && (
            <ExceptionForm
              tenant={w.tenant.id}
              group={group}
              slots={slots.rows}
              exception={e}
              date={e.occurrence_date}
            />
          )}
        </section>
      ))}
      {!exceptions.rows.length && (
        <p className="text-sm text-muted-foreground">
          No retained weekly occurrence exceptions.
        </p>
      )}
      <FinancePagination
        path={path}
        filters={{}}
        page={page}
        total={exceptions.total}
      />
      {audit && (
        <AcademicHistoryPanel
          title="Occurrence exception history"
          history={audit}
          zone={w.tenant.timezone}
          path={path}
          filters={{ history: String(search.history), page: String(page) }}
          page={hp}
        />
      )}
    </div>
  );
}
