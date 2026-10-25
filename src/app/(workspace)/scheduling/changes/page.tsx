import Link from "next/link";
import { scheduleChanges } from "@/features/academics/calendar-queries";
import { academicDate } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination } from "@/components/finance/pagination";
const labels: Record<string, string> = {
  lesson_rescheduled_out: "Original lesson rescheduled",
  lesson_rescheduled_in: "Replacement lesson scheduled",
  lesson_cancelled: "Lesson cancelled",
  lesson_updated: "Lesson details changed",
};
export const metadata = { title: "Schedule changes" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const d = await scheduleChanges(await searchParams),
    w = d.workspace,
    f = d.filters;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Schedule changes</h1>
      <p className="text-sm text-muted-foreground">
        In-app change feed for your authorized lessons: rescheduling,
        cancellation and teacher/room edits. Open linked originals and
        replacements for retained history. This feed does not send external
        messages.
      </p>
      <form
        action="/scheduling/changes"
        className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-5"
      >
        <SelectField label="Branch" name="branch" defaultValue={f.branch ?? ""}>
          <option value="">All authorized branches</option>
          {w.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Changes from"
          name="from"
          type="date"
          required
          defaultValue={f.from}
        />
        <Field
          label="Changes through"
          name="to"
          type="date"
          required
          defaultValue={f.to}
        />
        <Button type="submit" variant="outline">
          Filter changes
        </Button>
      </form>
      {d.rows.map((e) => (
        <article
          key={e.id}
          className="space-y-2 rounded-xl border bg-white p-5 text-sm"
        >
          <Link
            className="font-medium text-primary underline"
            href={`/lessons/${e.lesson_id}`}
          >
            {e.group_name} ·{" "}
            {labels[e.operation] ?? e.operation.replaceAll("_", " ")}
          </Link>
          <p>
            {e.actor_name} · {academicDate(e.created_at, w.tenant.timezone)} ·{" "}
            {e.branch_name}
          </p>
          <p>{e.reason}</p>
          <p className="text-muted-foreground">
            Retained lesson time: {academicDate(e.starts_at, w.tenant.timezone)}{" "}
            → {academicDate(e.ends_at, w.tenant.timezone)} ·{" "}
            {e.status.replaceAll("_", " ")}
          </p>
        </article>
      ))}
      {!d.rows.length && (
        <p className="text-sm text-muted-foreground">
          No authorized changes in this date range.
        </p>
      )}
      <FinancePagination
        path="/scheduling/changes"
        filters={f}
        page={d.page}
        total={d.total}
      />
    </div>
  );
}
