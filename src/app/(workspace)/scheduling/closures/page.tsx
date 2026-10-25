import Link from "next/link";
import { closureDirectory } from "@/features/academics/calendar-queries";
import type { AcademicSearch } from "@/features/academics/types";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination } from "@/components/finance/pagination";
export const metadata = { title: "Non-teaching dates" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const d = await closureDirectory(await searchParams),
    w = d.workspace,
    f = d.filters;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">
          Holidays and non-teaching dates
        </h1>
        {w.permissions.has("schedules.manage_holidays") && (
          <Button asChild>
            <Link href="/scheduling/closures/new">Add non-teaching date</Link>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Local business/branch calendars are configured explicitly. Existing
        lessons remain for review; new bookings and generation respect active
        closures. No national holiday calendar is assumed.
      </p>
      <form
        action="/scheduling/closures"
        className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SelectField
          label="Branch scope"
          name="branch"
          defaultValue={f.branch ?? ""}
        >
          <option value="">All authorized branches</option>
          {w.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Search calendar"
          name="q"
          maxLength={100}
          defaultValue={f.q}
        />
        <Field
          label="From"
          name="from"
          type="date"
          required
          defaultValue={f.from}
        />
        <Field
          label="Through"
          name="to"
          type="date"
          required
          defaultValue={f.to}
        />
        <SelectField
          label="State"
          name="status"
          defaultValue={f.status ?? "active"}
        >
          {["active", "inactive", "all"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="outline">
          Filter calendar
        </Button>
      </form>
      <div className="space-y-3">
        {d.rows.map((c) => (
          <article
            key={c.id}
            className="space-y-2 rounded-xl border bg-white p-5"
          >
            <Link
              className="font-semibold text-primary underline"
              href={`/scheduling/closures/${c.id}`}
            >
              {c.name}
            </Link>
            <p className="text-sm">
              {c.branch_name ?? "Whole business"} · {c.from_date} → {c.to_date}{" "}
              · {c.timezone} · {c.is_active ? "Active" : "Inactive"}
            </p>
            <p className="text-sm text-muted-foreground">{c.reason}</p>
            <Link
              className="text-sm text-primary underline"
              href={`/scheduling/closures/${c.id}`}
            >
              Review affected lessons and history
            </Link>
          </article>
        ))}
        {!d.rows.length && (
          <p className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">
            No authorized non-teaching periods match these filters.
          </p>
        )}
      </div>
      <FinancePagination
        path="/scheduling/closures"
        filters={f}
        page={d.page}
        total={d.total}
      />
    </div>
  );
}
