import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { academicDate } from "@/features/academics/queries";
import type { LessonRow } from "@/features/academics/scheduling-types";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
export function LessonList({
  rows,
  total,
  page,
  path = "/lessons",
  filters,
  zone,
  pageKey = "page",
  anchor = "",
}: {
  rows: LessonRow[];
  total: number;
  page: number;
  path?: string;
  filters: Record<string, string>;
  zone: string;
  pageKey?: string;
  anchor?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Authorized lesson records</caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                "Lesson / group",
                "Time",
                "Teaching employee",
                "Classroom / branch",
                "Status",
              ].map((h) => (
                <th key={h} scope="col" className="p-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="min-w-48 p-4">
                  <Link
                    className="font-medium text-primary underline"
                    href={`/lessons/${l.id}`}
                  >
                    {l.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.group_name} · {l.course_name}
                  </p>
                </td>
                <td className="whitespace-nowrap p-4">
                  <p>{academicDate(l.starts_at, zone)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    to {academicDate(l.ends_at, zone)} · {zone}
                  </p>
                </td>
                <td className="p-4">
                  {l.substitute_name ?? l.teacher_name}
                  {l.substitute_name && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Substitute for {l.teacher_name}
                    </p>
                  )}
                </td>
                <td className="p-4">
                  {l.classroom_name ?? "Online / no room"}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.branch_name}
                  </p>
                </td>
                <td className="p-4">
                  <Badge variant="outline">
                    {l.status.replaceAll("_", " ")}
                  </Badge>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-muted-foreground"
                >
                  No authorized lessons match this date range and filters. Add
                  an individual lesson or generate from a group&apos;s weekly
                  schedule.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        path={path}
        filters={filters}
        page={page}
        total={total}
        pageKey={pageKey}
        anchor={anchor}
      />
    </div>
  );
}
