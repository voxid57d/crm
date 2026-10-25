import Link from "next/link";
import {
  getClosure,
  closureImpact,
} from "@/features/academics/calendar-queries";
import { academicPage, academicDate } from "@/features/academics/queries";
import { businessDate } from "@/features/academics/group-queries";
import type { AcademicSearch } from "@/features/academics/types";
import { ClosureForm } from "@/components/academics/calendar-forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
import { FinancePagination } from "@/components/finance/pagination";
export const metadata = { title: "Non-teaching date details" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ closure: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).closure,
    search = await searchParams,
    hp = academicPage(search, "history_page"),
    page = academicPage(search),
    { workspace: w, detail: d } = await getClosure(id, hp),
    impact = await closureImpact(id, page),
    c = d.closure,
    path = `/scheduling/closures/${id}`;
  return (
    <div className="space-y-6">
      <Link className="text-primary underline" href="/scheduling/closures">
        Non-teaching calendar
      </Link>
      <h1 className="text-3xl font-semibold">{c.name}</h1>
      <p>
        {c.branch_name ?? "Whole business"} · {c.from_date} → {c.to_date} ·{" "}
        {c.timezone} · {c.is_active ? "Active" : "Inactive"}
      </p>
      <p className="text-sm text-muted-foreground">{c.reason}</p>
      {d.can_manage && (
        <div className="max-w-3xl">
          <ClosureForm workspace={w} closure={c} today={businessDate(w)} />
        </div>
      )}
      <section id="affected" className="space-y-4">
        <h2 className="text-xl font-semibold">
          Existing lessons in this period
        </h2>
        <p className="text-sm text-muted-foreground">
          Only authorized lesson records appear. These lessons have not been
          changed automatically.{" "}
          {c.is_active
            ? "Review scheduled bookings and explicitly reschedule or cancel when appropriate."
            : "This period is inactive; records below are retained for context."}{" "}
          Completed lessons and finalized attendance remain protected.
        </p>
        {impact.rows.map((l) => (
          <article
            key={l.id}
            className="space-y-2 rounded-xl border bg-white p-4 text-sm"
          >
            <Link
              className="font-medium text-primary underline"
              href={`/lessons/${l.id}`}
            >
              {l.group_name}
            </Link>
            <p>
              {l.branch_name} · {academicDate(l.starts_at, w.tenant.timezone)} →{" "}
              {academicDate(l.ends_at, w.tenant.timezone)} ·{" "}
              {l.status.replaceAll("_", " ")}
            </p>
            {l.has_finalized_attendance && (
              <p>Finalized attendance: protected historical record.</p>
            )}
            <div className="flex flex-wrap gap-4">
              {l.can_reschedule && (
                <Link
                  className="text-primary underline"
                  href={`/lessons/${l.id}/reschedule`}
                >
                  Reschedule outside closure
                </Link>
              )}
              <Link
                className="text-primary underline"
                href={`/lessons/${l.id}`}
              >
                Review lesson and permitted actions
              </Link>
            </div>
          </article>
        ))}
        {!impact.rows.length && (
          <p className="text-sm text-muted-foreground">
            No authorized current or completed lessons overlap this period.
          </p>
        )}
        <FinancePagination
          path={path}
          filters={{ history_page: String(hp) }}
          page={page}
          total={impact.total}
          anchor="#affected"
        />
      </section>
      <AcademicHistoryPanel
        title="Non-teaching date history"
        history={d.history}
        zone={w.tenant.timezone}
        path={path}
        page={hp}
      />
    </div>
  );
}
