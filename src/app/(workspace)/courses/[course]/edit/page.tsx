import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCourse,
  catalogOptions,
  canManageCourses,
} from "@/features/academics/queries";
import { CourseForm } from "@/components/academics/forms";
export const metadata = { title: "Edit course" };
export default async function EditCourse({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { workspace, detail } = await getCourse((await params).course);
  if (!canManageCourses(workspace)) notFound();
  const options = await catalogOptions();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        className="text-primary underline"
        href={`/courses/${detail.course.id}`}
      >
        Course profile
      </Link>
      <h1 className="text-3xl font-semibold">Edit course</h1>
      <CourseForm
        workspace={workspace}
        course={detail.course}
        options={options}
      />
    </div>
  );
}
