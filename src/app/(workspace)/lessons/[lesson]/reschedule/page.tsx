import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLesson,
  schedulingOptions,
} from "@/features/academics/scheduling-queries";
import { businessDate } from "@/features/academics/group-queries";
import { LessonForm } from "@/components/academics/scheduling-forms";
export const metadata = { title: "Reschedule lesson" };
export default async function Reschedule({
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
        Original lesson
      </Link>
      <h1 className="text-3xl font-semibold">Reschedule lesson</h1>
      <p className="text-sm text-muted-foreground">
        The original scheduled time will remain in history. Confirm the
        replacement teacher, room and future time; conflicts reject the whole
        change.
      </p>
      <LessonForm
        tenantId={w.tenant.id}
        options={options}
        lesson={d.lesson}
        today={businessDate(w)}
        zone={d.lesson.timezone}
        reschedule
      />
    </div>
  );
}
