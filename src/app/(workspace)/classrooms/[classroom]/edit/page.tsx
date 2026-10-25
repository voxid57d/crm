import Link from "next/link";
import { notFound } from "next/navigation";
import { getClassroom } from "@/features/academics/queries";
import { ClassroomForm } from "@/components/academics/forms";
export const metadata = { title: "Edit classroom" };
export default async function EditClassroom({
  params,
}: {
  params: Promise<{ classroom: string }>;
}) {
  const { workspace, detail } = await getClassroom((await params).classroom);
  if (!detail.can_manage) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/classrooms/${detail.classroom.id}`}
        className="text-primary underline"
      >
        Classroom profile
      </Link>
      <h1 className="text-3xl font-semibold">Edit classroom</h1>
      <ClassroomForm workspace={workspace} classroom={detail.classroom} />
    </div>
  );
}
