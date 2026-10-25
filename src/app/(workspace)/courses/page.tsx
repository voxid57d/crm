import Link from "next/link";
import {
  courseDirectory,
  canManageCourses,
} from "@/features/academics/queries";
import { pricingModels, type AcademicSearch } from "@/features/academics/types";
import { formatMoney } from "@/features/finance/money.mjs";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
export const metadata = { title: "Course catalog" };
export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const {
    workspace: w,
    rows,
    total,
    filters,
    page,
    categories,
    levels,
  } = await courseDirectory(await searchParams);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Course catalog</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {w.tenant.name} · Shared across business branches. Prices are
            templates; no automatic billing.
          </p>
        </div>
        {canManageCourses(w) && (
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/courses/settings">Categories & levels</Link>
            </Button>
            <Button asChild>
              <Link href="/courses/new">Add course</Link>
            </Button>
          </div>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Search name, code or description"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
        />
        <SelectField
          label="Status"
          name="status"
          defaultValue={filters.status ?? "active"}
        >
          <option value="active">Active</option>
          <option value="inactive">Archived</option>
          <option value="all">All courses</option>
        </SelectField>
        <SelectField
          label="Category"
          name="category"
          defaultValue={filters.category ?? ""}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Level"
          name="level"
          defaultValue={filters.level ?? ""}
        >
          <option value="">All levels</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Pricing model"
          name="pricing_model"
          defaultValue={filters.pricing_model ?? ""}
        >
          <option value="">All pricing models</option>
          {Object.entries(pricingModels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Sort"
          name="sort"
          defaultValue={filters.sort ?? "name"}
        >
          <option value="name">Name A–Z</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </SelectField>
        <div className="flex gap-3">
          <Button>Apply filters</Button>
          <Button asChild variant="ghost">
            <Link href="/courses?status=all">Reset</Link>
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Authorized shared course catalog
          </caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                "Course",
                "Category / level",
                "Default duration",
                "Price template",
                "Status",
              ].map((h) => (
                <th key={h} scope="col" className="p-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="min-w-48 p-4">
                  <Link
                    href={`/courses/${c.id}`}
                    className="font-medium text-primary underline"
                  >
                    {c.name}
                  </Link>
                  {c.code && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.code}
                    </p>
                  )}
                </td>
                <td className="p-4">
                  {c.category_name ?? "Uncategorized"}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.level_name ?? "No level"}
                  </p>
                </td>
                <td className="p-4">
                  {c.duration_value
                    ? `${c.duration_value} ${c.duration_unit}`
                    : "Not set"}
                  {c.lesson_duration_minutes && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.lesson_duration_minutes} min / lesson
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap p-4 tabular-nums">
                  {formatMoney(c.standard_price, c.currency)}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {
                      pricingModels[
                        c.pricing_model as keyof typeof pricingModels
                      ]
                    }
                  </p>
                </td>
                <td className="p-4">
                  <Badge variant={c.is_active ? "secondary" : "outline"}>
                    {c.is_active ? "Active" : "Archived"}
                  </Badge>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="p-10 text-center text-muted-foreground"
                >
                  No courses match these filters.{" "}
                  {canManageCourses(w)
                    ? "Add a course to start the catalog."
                    : "Ask a business administrator to configure the catalog."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination path="/courses" filters={filters} total={total} page={page} />
    </div>
  );
}
