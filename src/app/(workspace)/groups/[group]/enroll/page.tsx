import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getGroup,
  studentChoices,
  lmsOptions,
  businessDate,
} from "@/features/academics/group-queries";
import { queryValue, academicPage } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { EnrollmentForm } from "@/components/academics/delivery-forms";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
import { getStudent } from "@/features/customers/queries";
export const metadata = { title: "Enroll student" };
export default async function Enroll({
  params,
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).group,
    search = await searchParams,
    { workspace: w, detail: d } = await getGroup(id);
  if (!d.can_enroll || !["planned", "active"].includes(d.group.status))
    notFound();
  const q = queryValue(search, "q").slice(0, 100),
    page = academicPage(search),
    selected = queryValue(search, "student"),
    [students, options] = await Promise.all([
      studentChoices(id, q, page),
      lmsOptions(),
    ]),
    course = options.courses.find((c) => c.id === d.group.course_id);
  if (selected && !students.rows.some((s) => s.id === selected)) {
    const record = await getStudent(selected),
      match = await studentChoices(id, record.student.student_identifier, 0);
    const found = match.rows.find((s) => s.id === selected);
    if (found) students.rows.unshift(found);
  }
  return (
    <div className="max-w-4xl space-y-6">
      <Link className="text-primary underline" href={`/groups/${id}`}>
        Group details
      </Link>
      <h1 className="text-3xl font-semibold">
        Enroll student · {d.group.name}
      </h1>
      <p className="text-sm text-muted-foreground">
        Reuse an existing student identity. {d.counts.reserved_seats}/
        {d.group.capacity} seats reserved.
      </p>
      <form className="flex flex-wrap items-end gap-4">
        <Field
          label="Search existing students by name, identifier or phone"
          name="q"
          maxLength={100}
          defaultValue={q}
        />
        <Button variant="outline">Search students</Button>
      </form>
      {w.permissions.has("customers.create") && (
        <Button asChild variant="outline">
          <Link href={`/students/new?enroll_group=${id}`}>
            Add Student using the existing form
          </Link>
        </Button>
      )}
      <EnrollmentForm
        tenantId={w.tenant.id}
        group={d.group}
        students={students.rows}
        selected={selected}
        today={businessDate(w)}
        price={course?.standard_price ?? ""}
        model={course?.pricing_model ?? "monthly"}
      />
      <Pagination
        path={`/groups/${id}/enroll`}
        filters={{ q }}
        page={page}
        total={students.total}
      />
    </div>
  );
}
