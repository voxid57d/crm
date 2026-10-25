import Link from "next/link";
export function AcademicNavigation() {
  return (
    <nav
      aria-label="Education navigation"
      className="flex flex-wrap gap-4 border-b pb-4 text-sm text-primary"
    >
      <Link className="underline underline-offset-4" href="/students">
        Students
      </Link>
      <Link className="underline underline-offset-4" href="/courses">
        Courses
      </Link>
      <Link className="underline underline-offset-4" href="/classrooms">
        Classrooms
      </Link>
    </nav>
  );
}
