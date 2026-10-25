import Link from "next/link";
export function AcademicNavigation() {
  return (
    <nav
      aria-label="Education navigation"
      className="flex flex-wrap gap-4 border-b pb-4 text-sm text-primary"
    >
      <Link
        className="underline underline-offset-4"
        href="/scheduling/closures"
      >
        Non-teaching dates
      </Link>
      <Link className="underline underline-offset-4" href="/scheduling/changes">
        Schedule changes
      </Link>
      <Link className="underline underline-offset-4" href="/academics">
        Academic overview
      </Link>
      <Link className="underline underline-offset-4" href="/students">
        Students
      </Link>
      <Link className="underline underline-offset-4" href="/courses">
        Courses
      </Link>
      <Link className="underline underline-offset-4" href="/classrooms">
        Classrooms
      </Link>
      <Link className="underline underline-offset-4" href="/groups">
        Groups
      </Link>
      <Link className="underline underline-offset-4" href="/enrollments">
        Enrollments
      </Link>
      <Link className="underline underline-offset-4" href="/lessons">
        Lessons
      </Link>
      <Link className="underline underline-offset-4" href="/timetable">
        Timetable
      </Link>
      <Link className="underline underline-offset-4" href="/attendance">
        Attendance
      </Link>
    </nav>
  );
}
