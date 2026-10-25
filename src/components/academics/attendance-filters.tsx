import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  attendanceStatuses,
  type AttendanceOptions,
} from "@/features/academics/attendance-types";
import type { getWorkspace } from "@/features/workspace/context";
export function AttendanceFilters({
  workspace: w,
  options: o,
  filters: f,
  history = false,
}: {
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  options: AttendanceOptions;
  filters: Record<string, string>;
  history?: boolean;
}) {
  const courses = [
    ...new Map(
      o.groups.map((g) => [
        g.course_id,
        { id: g.course_id, name: g.course_name },
      ]),
    ).values(),
  ];
  return (
    <form
      action={history ? "/attendance/history" : "/attendance"}
      className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4"
    >
      {!history && (
        <SelectField label="Workspace view" name="view" defaultValue={f.view}>
          {[
            ["today", "Today's lessons"],
            ["upcoming", "Upcoming lessons"],
            ["awaiting", "Awaiting attendance"],
            ["recent", "Recently completed lessons"],
            ["all", "All lessons, including retained cancellations"],
          ].map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField label="Branch" name="branch" defaultValue={f.branch || ""}>
        <option value="">All authorized branches</option>
        {w.branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Course" name="course" defaultValue={f.course || ""}>
        <option value="">All authorized courses</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Group" name="group" defaultValue={f.group || ""}>
        <option value="">All authorized groups</option>
        {o.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Teacher"
        name="teacher"
        defaultValue={f.teacher || ""}
      >
        <option value="">All authorized teaching employees</option>
        {o.teachers.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </SelectField>
      <Field
        label="From"
        name="from"
        type="date"
        required
        defaultValue={f.from}
      />
      <Field
        label="Through"
        name="to"
        type="date"
        required
        defaultValue={f.to}
      />
      {history && (
        <>
          <Field
            label="Student name or identifier"
            name="q"
            maxLength={100}
            defaultValue={f.q}
          />
          <SelectField
            label="Attendance status"
            name="status"
            defaultValue={f.status || "all"}
          >
            <option value="all">All marks</option>
            {attendanceStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Sheet state"
            name="sheet"
            defaultValue={f.sheet || "all"}
          >
            {["all", "draft", "finalized"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          {f.student && (
            <input type="hidden" name="student" value={f.student} />
          )}
        </>
      )}
      <SelectField
        label="Sort lessons"
        name="sort"
        defaultValue={f.sort || (history ? "newest" : "start")}
      >
        <option value={history ? "oldest" : "start"}>Oldest first</option>
        <option value="newest">Newest first</option>
      </SelectField>
      <Button type="submit" variant="outline">
        Apply attendance filters
      </Button>
    </form>
  );
}
