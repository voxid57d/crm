import { getWorkspace } from "@/features/workspace/context";
import { studentEnrollments } from "@/features/academics/integration-queries";
import { SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { EnrollmentList } from "./enrollment-list";
export async function StudentEnrollments({
  studentId,
  path,
  page,
  status = "all",
}: {
  studentId: string;
  path: string;
  page: number;
  status?: string;
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
  const d = await studentEnrollments(studentId, page, status);
  return (
    <section id="learning" className="space-y-4 md:col-span-2">
      <h2 className="text-xl font-semibold">
        Courses, groups and enrollment history
      </h2>
      <p className="text-sm text-muted-foreground">
        Enrollments reference this original Student Profile. Only authorized
        groups appear; tuition requires a separate pricing permission. Open a
        group for its lessons and timetable. Attendance will be added later.
      </p>
      <form className="flex flex-wrap items-end gap-3" action={path}>
        <SelectField
          label="Enrollment history"
          name="enrollment_status"
          defaultValue={status}
        >
          {[
            "all",
            "open",
            "pending",
            "active",
            "paused",
            "completed",
            "withdrawn",
            "cancelled",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <Button variant="outline" type="submit">
          Filter enrollments
        </Button>
      </form>
      <EnrollmentList
        rows={d.rows}
        total={d.total}
        page={page}
        path={path}
        pageKey="enrollment_page"
        filters={{ enrollment_status: status }}
      />
    </section>
  );
}
