import Link from "next/link";
import { getStudent } from "@/features/customers/queries";
import { StudentForm } from "@/components/customers/student-form";
export const metadata = { title: "Edit student" };
export default async function EditStudent({
  params,
}: {
  params: Promise<{ customer: string }>;
}) {
  const record = await getStudent((await params).customer);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/students/${record.customer.id}`}
        className="text-primary underline"
      >
        Student profile
      </Link>
      <h1 className="text-3xl font-semibold">Edit student</h1>
      <StudentForm options={record} record={record} />
    </div>
  );
}
