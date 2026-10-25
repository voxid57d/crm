import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import {
  lessonStatuses,
  type TimetableOptions,
} from "@/features/academics/scheduling-types";
import type { getWorkspace } from "@/features/workspace/context";
import { branchGrant } from "@/features/academics/group-queries";
export function LessonFilters({
  workspace: w,
  options,
  filters,
  calendar = false,
  view = "week",
  date,
}: {
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  options: TimetableOptions;
  filters: Record<string, string>;
  calendar?: boolean;
  view?: string;
  date?: string;
}) {
  const courses = [
    ...new Map(
      options.groups.map((g) => [
        g.course_id,
        { id: g.course_id, name: g.course_name },
      ]),
    ).values(),
  ];
  return (
    <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">
      {calendar ? (
        <>
          <Field
            label="Calendar date"
            name="date"
            type="date"
            required
            defaultValue={date}
          />
          <SelectField label="Calendar view" name="view" defaultValue={view}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </SelectField>
        </>
      ) : (
        <>
          <Field
            label="From date"
            name="from"
            type="date"
            required
            defaultValue={filters.from}
          />
          <Field
            label="Through date"
            name="to"
            type="date"
            required
            defaultValue={filters.to}
          />
        </>
      )}
      <Field
        label="Search title or group"
        name="q"
        maxLength={100}
        defaultValue={filters.q}
      />
      <SelectField
        label="Branch"
        name="branch"
        defaultValue={filters.branch ?? ""}
      >
        <option value="">All authorized branches</option>
        {w.branches
          .filter(
            (b) =>
              branchGrant(w, "lessons.view", b.id) &&
              (!calendar || branchGrant(w, "schedules.view", b.id)),
          )
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
      </SelectField>
      <SelectField
        label="Course"
        name="course"
        defaultValue={filters.course ?? ""}
      >
        <option value="">All courses</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Group"
        name="group"
        defaultValue={filters.group ?? ""}
      >
        <option value="">All authorized groups</option>
        {options.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Teaching employee"
        name="teacher"
        defaultValue={filters.teacher ?? ""}
      >
        <option value="">All authorized teachers</option>
        <option value="me">My teaching</option>
        {options.teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Classroom"
        name="classroom"
        defaultValue={filters.classroom ?? ""}
      >
        <option value="">All classrooms / online</option>
        {options.classrooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Lesson status"
        name="status"
        defaultValue={filters.status ?? "all"}
      >
        <option value="all">All statuses</option>
        {lessonStatuses.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </SelectField>
      {!calendar && (
        <SelectField
          label="Sort"
          name="sort"
          defaultValue={filters.sort ?? "start"}
        >
          <option value="start">Scheduled start</option>
          <option value="newest">Newest records</option>
        </SelectField>
      )}
      <Button>Apply filters</Button>
    </form>
  );
}
