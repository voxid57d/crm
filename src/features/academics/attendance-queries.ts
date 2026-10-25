import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { academicFilters, academicPage, queryValue } from "./queries";
import { businessDate } from "./group-queries";
import { addDays } from "./calendar.mjs";
import type { AcademicSearch } from "./types";
import type { Directory } from "./group-types";
import type {
  AttendanceDetail,
  AttendanceOptions,
  AttendanceLessonRow,
  AttendanceHistoryRow,
} from "./attendance-types";
function checked(error: { code?: string; message: string } | null) {
  if (error?.code === "42501") notFound();
  if (error)
    throw new Error(
      "Attendance could not load. Verify date filters, enrollment history, access and local services.",
    );
}
export const getAttendance = cache(
  async (lesson: string, page = 0, historyPage = 0) => {
    try {
      uuid(lesson);
    } catch {
      notFound();
    }
    const workspace = await getWorkspace(),
      r = await workspace.supabase.rpc("attendance_sheet_details", {
        p_tenant: workspace.tenant.id,
        p_lesson: lesson,
        p_page: page,
        p_history_page: historyPage,
      });
    checked(r.error);
    return { workspace, detail: r.data as unknown as AttendanceDetail };
  },
);
export const attendanceOptions = cache(async () => {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("attendance_options", { p_tenant: w.tenant.id });
  checked(r.error);
  return r.data as unknown as AttendanceOptions;
});
export async function attendanceDirectory(
  search: AcademicSearch,
  history: true,
): Promise<{
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  options: AttendanceOptions;
  filters: Record<string, string>;
  page: number;
  data: Directory<AttendanceHistoryRow>;
}>;
export async function attendanceDirectory(
  search: AcademicSearch,
  history?: false,
): Promise<{
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  options: AttendanceOptions;
  filters: Record<string, string>;
  page: number;
  data: Directory<AttendanceLessonRow>;
}>;
export async function attendanceDirectory(
  search: AcademicSearch,
  history = false,
) {
  const workspace = await getWorkspace(),
    options = await attendanceOptions(),
    page = academicPage(search),
    filters = academicFilters(search, [
      "branch",
      "group",
      "course",
      "teacher",
      "from",
      "to",
      "sort",
      ...(history ? ["q", "student", "status", "sheet"] : ["view"]),
    ]),
    today = businessDate(workspace);
  if (!Object.hasOwn(search, "branch") && workspace.branch)
    filters.branch = workspace.branch.id;
  const view = queryValue(search, "view") || "today";
  if (!history) filters.view = view;
  filters.from ??=
    history || ["awaiting", "recent", "all"].includes(view)
      ? addDays(today, -30)
      : today;
  filters.to ??= view === "upcoming" && !history ? addDays(today, 30) : today;
  const r = history
    ? await workspace.supabase.rpc("attendance_record_directory", {
        p_tenant: workspace.tenant.id,
        p_filters: filters,
        p_page: page,
      })
    : await workspace.supabase.rpc("attendance_lesson_directory", {
        p_tenant: workspace.tenant.id,
        p_filters: filters,
        p_page: page,
      });
  checked(r.error);
  return {
    workspace,
    options,
    filters,
    page,
    data: r.data as unknown as
      Directory<AttendanceLessonRow> | Directory<AttendanceHistoryRow>,
  };
}
