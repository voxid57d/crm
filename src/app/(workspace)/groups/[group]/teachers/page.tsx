import { notFound } from "next/navigation";
import Link from "next/link";
import { getGroup, teacherChoices } from "@/features/academics/group-queries";
import { queryValue, academicPage } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { TeachersForm } from "@/components/academics/delivery-forms";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
export const metadata = { title: "Assign group teachers" };
export default async function GroupTeachers({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).group,
    search = await searchParams,
    { workspace: w, detail: d } = await getGroup(id);
  if (
    !d.can_assign ||
    ["completed", "cancelled", "archived"].includes(d.group.status)
  )
    notFound();
  const q = queryValue(search, "q").slice(0, 100),
    page = academicPage(search),
    choices = await teacherChoices(id, q, page);
  return (
    <div className="max-w-4xl space-y-6">
      <Link className="text-primary underline" href={`/groups/${id}`}>
        Group details
      </Link>
      <h1 className="text-3xl font-semibold">
        Assign teachers · {d.group.name}
      </h1>
      <form className="flex flex-wrap items-end gap-4">
        <Field
          label="Search eligible employee teachers"
          name="q"
          maxLength={100}
          defaultValue={q}
        />
        <Button variant="outline">Search teachers</Button>
      </form>
      <TeachersForm
        tenantId={w.tenant.id}
        group={d.group}
        choices={choices.rows}
      />
      <Pagination
        path={`/groups/${id}/teachers`}
        filters={{ q }}
        page={page}
        total={choices.total}
      />
    </div>
  );
}
