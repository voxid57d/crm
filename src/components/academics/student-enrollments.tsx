import { getWorkspace } from "@/features/workspace/context";
import { enrollmentDirectory } from "@/features/academics/group-queries";
import { EnrollmentList } from "./enrollment-list";
export async function StudentEnrollments({
  studentId,
  path,
  page,
}: {
  studentId: string;
  path: string;
  page: number;
}) {
  const w = await getWorkspace();
  if (!w.permissions.has("enrollments.view"))
    return (
      <section id="learning" className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Courses and groups</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Academic enrollment information is restricted.
        </p>
      </section>
    );
  const d = await enrollmentDirectory(
    { student: studentId, page: String(page) },
    false,
  );
  return (
    <section id="learning" className="space-y-4 md:col-span-2">
      <h2 className="text-xl font-semibold">
        Courses, groups and enrollment history
      </h2>
      <p className="text-sm text-muted-foreground">
        Enrollments reference this original Student Profile. Only authorized
        groups appear; tuition requires a separate pricing permission. Lessons
        and attendance will be added in later increments.
      </p>
      <EnrollmentList
        rows={d.rows}
        total={d.total}
        page={page}
        path={path}
        pageKey="enrollment_page"
      />
    </section>
  );
}
