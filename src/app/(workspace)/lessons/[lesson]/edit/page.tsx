import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLesson,
  schedulingOptions,
} from "@/features/academics/scheduling-queries";
import { businessDate } from "@/features/academics/group-queries";
import { LessonForm } from "@/components/academics/scheduling-forms";
export const metadata = { title: "Edit upcoming lesson" };
export default async function EditLesson({
  params,
}: {
  params: Promise<{ lesson: string }>;
}) {
  const id = (await params).lesson,
    { workspace: w, detail: d } = await getLesson(id);
  if (!d.can_edit) notFound();
  const options = await schedulingOptions(d.lesson.group_id);
  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/lessons/${id}`} className="text-primary underline">
        Lesson details
      </Link>
      <h1 className="text-3xl font-semibold">Edit upcoming lesson</h1>
      <LessonForm
        tenantId={w.tenant.id}
        options={options}
        lesson={d.lesson}
        today={businessDate(w)}
        zone={d.lesson.timezone}
      />
    </div>
  );
}
