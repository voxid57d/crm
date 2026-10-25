import { redirect, notFound } from "next/navigation";
import { getGroup } from "@/features/academics/group-queries";
import { customerOptions, getCustomer } from "@/features/customers/queries";
import { StudentForm } from "@/components/customers/student-form";
export const metadata = { title: "Add student" };
export default async function NewStudent({
  searchParams,
}: {
  searchParams: Promise<{ existing?: string; enroll_group?: string }>;
}) {
  const search = await searchParams,
    enrollment = search.enroll_group
      ? await getGroup(search.enroll_group)
      : undefined,
    record = search.existing ? await getCustomer(search.existing) : undefined,
    options = record ?? (await customerOptions());
  if (
    enrollment &&
    (!enrollment.detail.can_enroll ||
      !["planned", "active"].includes(enrollment.detail.group.status))
  )
    notFound();
  if (record?.student)
    redirect(
      enrollment
        ? `/groups/${enrollment.detail.group.id}/enroll?student=${record.customer.id}`
        : `/students/${record.customer.id}`,
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Add student</h1>
      <p className="text-sm text-muted-foreground">
        Enter details once. Check existing contacts before creating another
        person; use a match to retain their history. No invoice or course
        enrollment is created.
      </p>
      {enrollment && (
        <p className="text-sm text-muted-foreground">
          After saving, return to enrollment for {enrollment.detail.group.name}.
          Enrollment requires a separate agreement confirmation.
        </p>
      )}
      <StudentForm
        options={options}
        record={record}
        enrollmentGroup={enrollment?.detail.group.id}
        enrollmentBranch={enrollment?.detail.group.branch_id}
      />
    </div>
  );
}
