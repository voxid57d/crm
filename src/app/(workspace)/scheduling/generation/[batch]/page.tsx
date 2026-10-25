import Link from "next/link";
import { generationBatch } from "@/features/academics/scheduling-queries";
import { generationSkips } from "@/features/academics/calendar-queries";
import { academicPage } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { FinancePagination } from "@/components/finance/pagination";
export const metadata = { title: "Lesson generation receipt" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ batch: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).batch,
    page = academicPage(await searchParams),
    b = await generationBatch(id),
    d = await generationSkips(id, page);
  return (
    <div className="space-y-6">
      <Link
        className="text-primary underline"
        href={`/groups/${b.group_id}/schedules`}
      >
        Group weekly schedules
      </Link>
      <h1 className="text-3xl font-semibold">Lesson generation receipt</h1>
      <p>
        {b.from_date} → {b.to_date}
      </p>
      <p className="text-sm">
        {b.created_count} created · {b.existing_count} retained existing ·{" "}
        {b.past_count} past starts · {b.closure_count} closure skips ·{" "}
        {b.exception_count} occurrence exceptions
      </p>
      <p className="text-sm text-muted-foreground">
        This original receipt is retained even if calendar rules later change.
        Skips are not cancelled lessons or student absences.
      </p>
      {d.rows.map((s) => (
        <article
          key={s.id}
          className="space-y-2 rounded-xl border bg-white p-4 text-sm"
        >
          <p>
            {s.occurrence_date} · {s.reason}
          </p>
          <Link
            className="text-primary underline"
            href={`/groups/${b.group_id}/schedules/${s.slot_id}`}
          >
            Source weekly period
          </Link>
          {s.closure_id && (
            <p>
              <Link
                className="text-primary underline"
                href={`/scheduling/closures/${s.closure_id}`}
              >
                Retained non-teaching date
              </Link>
            </p>
          )}
          {s.exception_id && (
            <p>
              <Link
                className="text-primary underline"
                href={`/groups/${b.group_id}/schedules/exceptions?history=${s.exception_id}`}
              >
                Retained occurrence exception
              </Link>
            </p>
          )}
        </article>
      ))}
      {!d.rows.length && (
        <p className="text-sm text-muted-foreground">
          No closure or occurrence skips on this receipt page.
        </p>
      )}
      <FinancePagination
        path={`/scheduling/generation/${id}`}
        filters={{}}
        page={page}
        total={d.total}
      />
    </div>
  );
}
