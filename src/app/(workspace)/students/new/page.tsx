import { redirect } from "next/navigation";
import { customerOptions, getCustomer } from "@/features/customers/queries";
import { StudentForm } from "@/components/customers/student-form";
export const metadata = { title: "Add student" };
export default async function NewStudent({
  searchParams,
}: {
  searchParams: Promise<{ existing?: string }>;
}) {
  const search = await searchParams,
    record = search.existing ? await getCustomer(search.existing) : undefined,
    options = record ?? (await customerOptions());
  if (record?.student) redirect(`/students/${record.customer.id}`);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Add student</h1>
      <p className="text-sm text-muted-foreground">
        Enter details once. Check existing contacts before creating another
        person; use a match to retain their history. No invoice or course
        enrollment is created.
      </p>
      <StudentForm options={options} record={record} />
    </div>
  );
}
