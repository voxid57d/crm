import Link from "next/link";
import {
  getCourse,
  academicPage,
  academicDate,
} from "@/features/academics/queries";
import { pricingModels, type AcademicSearch } from "@/features/academics/types";
import { formatMoney } from "@/features/finance/money.mjs";
import { AcademicStateForm } from "@/components/academics/forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { courseGroupSummary } from "@/features/academics/group-queries";
export const metadata = { title: "Course profile" };
export default async function CourseProfile({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).course,
    search = await searchParams,
    page = academicPage(search, "history_page"),
    { workspace: w, detail: d } = await getCourse(id, page),
    c = d.course,
    summary = await courseGroupSummary(id);
  return (
    <div className="space-y-6">
      <Link href="/courses" className="text-primary underline">
        Course catalog
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{c.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant={c.is_active ? "secondary" : "outline"}>
              {c.is_active ? "Active" : "Archived"}
            </Badge>
            {c.code && (
              <span className="text-sm text-muted-foreground">{c.code}</span>
            )}
          </div>
        </div>
        {d.can_manage && (
          <Button asChild variant="outline">
            <Link href={`/courses/${id}/edit`}>Edit course</Link>
          </Button>
        )}
      </div>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Course saved.
        </p>
      )}
      <section className="space-y-5 rounded-xl border bg-white p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Course information</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              "Category",
              `${c.category_name ?? "Uncategorized"}${d.category_active === false ? " (inactive; retained)" : ""}`,
            ],
            [
              "Level",
              `${c.level_name ?? "Not set"}${d.level_active === false ? " (inactive; retained)" : ""}`,
            ],
            [
              "Default duration",
              c.duration_value
                ? `${c.duration_value} ${c.duration_unit}`
                : "Not set",
            ],
            [
              "Default lesson duration",
              c.lesson_duration_minutes
                ? `${c.lesson_duration_minutes} minutes`
                : "Not set",
            ],
            ["Standard price", formatMoney(c.standard_price, c.currency)],
            [
              "Pricing model",
              pricingModels[c.pricing_model as keyof typeof pricingModels],
            ],
            ["Created", academicDate(c.created_at, w.tenant.timezone)],
            ["Last modified", academicDate(c.updated_at, w.tenant.timezone)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="whitespace-pre-wrap text-sm leading-6">
          {c.description || "No description provided."}
        </p>
        <p className="text-sm text-muted-foreground">
          This price is a template. Changes do not generate charges or rewrite
          existing agreements or invoices. Course categories and levels classify
          the shared catalog.
        </p>
      </section>
      <section className="space-y-2 rounded-xl border border-dashed p-5">
        <h2 className="font-semibold">Groups and enrollments</h2>
        <p className="text-sm text-muted-foreground">
          {summary.groups} groups · {summary.active_groups} active groups ·{" "}
          {summary.active_enrollments} active enrollments within your group
          access. An enrollment counts once per group, even when a student has
          multiple groups.
        </p>
        {(w.permissions.has("groups.view") ||
          w.permissions.has("groups.view_assigned")) && (
          <Link
            href={`/groups?course=${id}&branch=&status=all`}
            className="text-sm text-primary underline"
          >
            View authorized course groups
          </Link>
        )}
      </section>
      {d.can_manage && (
        <>
          <AcademicStateForm
            tenantId={w.tenant.id}
            kind="course"
            id={id}
            active={c.is_active}
            version={c.version}
          />
          <AcademicHistoryPanel
            history={d.history}
            zone={w.tenant.timezone}
            path={`/courses/${id}`}
            page={page}
          />
        </>
      )}
    </div>
  );
}
