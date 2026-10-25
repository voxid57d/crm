import Link from "next/link";
import { localDateTime } from "@/lib/time.mjs";
import type { LessonRow } from "@/features/academics/scheduling-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export function Timetable({
  days,
  rows,
  zone,
  view,
}: {
  days: string[];
  rows: LessonRow[];
  zone: string;
  view: string;
}) {
  return (
    <div
      className={
        view === "day"
          ? "space-y-4"
          : "grid gap-3 sm:grid-cols-2 xl:grid-cols-7"
      }
    >
      {days.map((day) => {
        const events = rows.filter((l) => {
          const start = localDateTime(l.starts_at, zone),
            end = localDateTime(l.ends_at, zone);
          return (
            start.slice(0, 10) <= day &&
            (end.slice(0, 10) > day ||
              (end.slice(0, 10) === day && end.slice(11) > "00:00"))
          );
        });
        return (
          <section
            key={day}
            aria-label={day}
            className="min-w-0 space-y-3 rounded-xl border bg-muted/20 p-3"
          >
            <h2 className="text-sm font-semibold">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "UTC",
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date(day + "T00:00:00Z"))}
            </h2>
            {events.map((l) => (
              <Link
                key={l.id}
                href={`/lessons/${l.id}`}
                className="block space-y-2 rounded-lg border bg-white p-3 text-xs shadow-sm hover:border-primary"
              >
                <p className="font-semibold text-primary">{l.group_name}</p>
                <p className="break-words">
                  {l.course_name} · {l.title}
                </p>
                <p className="font-medium tabular-nums">
                  {localDateTime(l.starts_at, zone).slice(0, 10) !== day
                    ? localDateTime(l.starts_at, zone).slice(0, 10) + " "
                    : ""}
                  {localDateTime(l.starts_at, zone).slice(11)} →{" "}
                  {localDateTime(l.ends_at, zone).slice(0, 10) !== day
                    ? localDateTime(l.ends_at, zone).slice(0, 10) + " "
                    : ""}
                  {localDateTime(l.ends_at, zone).slice(11)}
                </p>
                <p>
                  {l.substitute_name ?? l.teacher_name}
                  {l.substitute_name ? " (substitute)" : ""}
                </p>
                <p>
                  {l.classroom_name ?? "Online / no room"} · {l.branch_name}
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {l.status.replaceAll("_", " ")}
                </Badge>
              </Link>
            ))}
            {!events.length && (
              <p className="py-4 text-xs text-muted-foreground">
                No lessons on this page.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
export function CalendarPagination({
  filters,
  page,
  total,
  size,
  path = "/timetable",
}: {
  filters: Record<string, string>;
  page: number;
  total: number;
  size: number;
  path?: string;
}) {
  const href = (p: number) =>
    path + "?" + new URLSearchParams({ ...filters, page: String(p) });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>
        {total} authorized lessons · Page {page + 1} of{" "}
        {Math.max(1, Math.ceil(total / size))} · Up to {size} lessons per page
      </p>
      <div className="flex gap-2">
        {page > 0 && (
          <Button variant="outline" asChild>
            <Link href={href(page - 1)}>Previous lessons</Link>
          </Button>
        )}
        {(page + 1) * size < total && (
          <Button variant="outline" asChild>
            <Link href={href(page + 1)}>More lessons</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
