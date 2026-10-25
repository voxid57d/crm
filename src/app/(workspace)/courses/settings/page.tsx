import { notFound } from "next/navigation";
import {
  catalogOptions,
  canManageCourses,
  academicPage,
  queryValue,
} from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { CourseSettingForm } from "@/components/academics/forms";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
export const metadata = { title: "Course categories and levels" };
export default async function CourseSettings({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const search = await searchParams,
    options = await catalogOptions(),
    w = options.workspace;
  if (!canManageCourses(w)) notFound();
  const kind = queryValue(search, "kind") === "level" ? "level" : "category",
    q = queryValue(search, "q").slice(0, 100),
    page = academicPage(search),
    settings = (
      kind === "category" ? options.categories : options.levels
    ).filter((s) => s.name.toLowerCase().includes(q.toLowerCase())),
    rows = settings.slice(page * 20, page * 20 + 20);
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Course categories and levels</h1>
      <p className="text-sm text-muted-foreground">
        Names are unique within each list. Deactivation prevents new assignments
        and retains existing course references.
      </p>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-3">
        <SelectField label="Configure" name="kind" defaultValue={kind}>
          <option value="category">Categories</option>
          <option value="level">Levels</option>
        </SelectField>
        <Field label="Search names" name="q" maxLength={100} defaultValue={q} />
        <Button>Filter settings</Button>
      </form>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Add {kind}</h2>
        <CourseSettingForm tenantId={w.tenant.id} kind={kind} />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Existing {kind === "category" ? "categories" : "levels"}
        </h2>
        {rows.map((s) => (
          <CourseSettingForm
            key={s.id}
            tenantId={w.tenant.id}
            kind={kind}
            setting={s}
          />
        ))}
        {!rows.length && (
          <p className="text-sm text-muted-foreground">
            No settings match. Create a name or clear the search.
          </p>
        )}
        <Pagination
          path="/courses/settings"
          filters={{ kind, q }}
          page={page}
          total={settings.length}
        />
      </section>
    </div>
  );
}
