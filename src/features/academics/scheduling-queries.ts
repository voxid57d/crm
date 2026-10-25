import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { academicFilters, academicPage } from "./queries";
import type { AcademicSearch } from "./types";
import type { Directory } from "./group-types";
import type {
  SchedulingOptions,
  TimetableOptions,
  SlotDetail,
  SlotRow,
  LessonDetail,
  LessonRow,
  ExpectedRoster,
  GenerationBatch,
} from "./scheduling-types";
import { businessDate } from "./group-queries";
import { addDays } from "./calendar.mjs";
function checked(error: { code?: string } | null) {
  if (error?.code === "42501") notFound();
  if (error)
    throw new Error(
      "Scheduling records could not load. Verify date ranges, filters and local services.",
    );
}
function id(value: string) {
  try {
    return uuid(value);
  } catch {
    notFound();
  }
}
export const schedulingOptions = cache(async (group: string) => {
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("scheduling_options", {
      p_tenant: workspace.tenant.id,
      p_group: id(group),
    });
  checked(r.error);
  return { workspace, ...(r.data as unknown as SchedulingOptions) };
});
export const timetableOptions = cache(async () => {
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("timetable_options", {
      p_tenant: workspace.tenant.id,
    });
  checked(r.error);
  return { workspace, ...(r.data as unknown as TimetableOptions) };
});
export async function scheduleDirectory(group: string, search: AcademicSearch) {
  const w = await getWorkspace(),
    page = academicPage(search),
    status = search.status === "all" ? "all" : "current",
    r = await w.supabase.rpc("group_schedule_directory", {
      p_tenant: w.tenant.id,
      p_group: id(group),
      p_page: page,
      p_status: status,
    });
  checked(r.error);
  return { page, status, ...(r.data as unknown as Directory<SlotRow>) };
}
export const getSlot = cache(async (slot: string, page = 0) => {
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("group_schedule_details", {
      p_tenant: workspace.tenant.id,
      p_slot: id(slot),
      p_history_page: page,
    });
  checked(r.error);
  return { workspace, detail: r.data as unknown as SlotDetail };
});
export const getLesson = cache(async (lesson: string, page = 0) => {
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("lesson_details", {
      p_tenant: workspace.tenant.id,
      p_lesson: id(lesson),
      p_history_page: page,
    });
  checked(r.error);
  return { workspace, detail: r.data as unknown as LessonDetail };
});
export async function lessonDirectory(
  search: AcademicSearch,
  calendar = false,
) {
  const workspace = await getWorkspace(),
    filters = academicFilters(search, [
      "q",
      "branch",
      "course",
      "group",
      "teacher",
      "classroom",
      "status",
      "from",
      "to",
      "sort",
    ]),
    page = academicPage(search);
  filters.from ??= businessDate(workspace);
  if (typeof search.teacher === "string") filters.teacher = search.teacher;
  filters.to ??= addDays(filters.from, 6);
  const r = await workspace.supabase.rpc("lesson_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
    p_calendar: calendar,
  });
  checked(r.error);
  return {
    workspace,
    filters,
    page,
    ...(r.data as unknown as Directory<LessonRow> & { page_size: number }),
  };
}
export async function expectedRoster(lesson: string, page: number) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("lesson_expected_roster", {
      p_tenant: w.tenant.id,
      p_lesson: id(lesson),
      p_page: page,
    });
  checked(r.error);
  return r.data as unknown as ExpectedRoster;
}
export async function generationBatch(batch: string) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("generation_batch_details", {
      p_tenant: w.tenant.id,
      p_batch: id(batch),
    });
  checked(r.error);
  return r.data as unknown as GenerationBatch;
}
