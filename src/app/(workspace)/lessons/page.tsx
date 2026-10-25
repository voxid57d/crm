import Link from "next/link";
import {
  lessonDirectory,
  timetableOptions,
} from "@/features/academics/scheduling-queries";
import { getWorkspace } from "@/features/workspace/context";
import type { AcademicSearch } from "@/features/academics/types";
import { LessonList } from "@/components/academics/lesson-list";
import { LessonFilters } from "@/components/academics/lesson-filters";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Lessons" };
export default async function Lessons({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const search = await searchParams,
    w = await getWorkspace();
  if (
    !Object.hasOwn(search, "teacher") &&
    !w.permissions.has("lessons.manage") &&
    w.permissions.has("groups.view_assigned")
  )
    search.teacher = "me";
  const [d, options] = await Promise.all([
    lessonDirectory(search),
    timetableOptions(),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Lessons</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Individual and generated lesson records. Times below use{" "}
            {w.tenant.timezone}.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/timetable">Timetable</Link>
          </Button>
          {options.groups.some((g) => g.can_create) && (
            <Button asChild>
              <Link href="/lessons/new">Add lesson</Link>
            </Button>
          )}
        </div>
      </div>
      <LessonFilters workspace={w} options={options} filters={d.filters} />
      <LessonList
        rows={d.rows}
        total={d.total}
        page={d.page}
        filters={d.filters}
        zone={w.tenant.timezone}
      />
    </div>
  );
}
