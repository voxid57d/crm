import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { academicFilters, academicPage } from "./queries";
import { businessDate } from "./group-queries";
import { addDays } from "./calendar.mjs";
import type { AcademicSearch } from "./types";
import type { AcademicHistory } from "./types";
import type { Directory } from "./group-types";
import type {
  Closure,
  ClosureDetail,
  ClosureImpact,
  ScheduleException,
  GenerationSkip,
  CalendarContext,
  ScheduleChange,
} from "./calendar-types";
function checked(e: { code?: string } | null) {
  if (e?.code === "42501") notFound();
  if (e)
    throw new Error(
      "Academic calendar could not load. Verify local migrations, dates and permissions.",
    );
}
function id(s: string) {
  try {
    return uuid(s);
  } catch {
    notFound();
  }
}
export async function closureDirectory(
  search: AcademicSearch,
  calendar = false,
) {
  const workspace = await getWorkspace(),
    filters = academicFilters(search, ["branch", "q", "status", "from", "to"]),
    page = academicPage(search, calendar ? "closure_page" : "page");
  filters.from ??= businessDate(workspace);
  filters.to ??= addDays(filters.from, calendar ? 6 : 365);
  const r = await workspace.supabase.rpc("academic_closure_directory", {
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
    ...(r.data as unknown as Directory<Closure> & { page_size: number }),
  };
}
export const getClosure = cache(async (closure: string, page = 0) => {
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("academic_closure_details", {
      p_tenant: workspace.tenant.id,
      p_closure: id(closure),
      p_page: page,
    });
  checked(r.error);
  return { workspace, detail: r.data as unknown as ClosureDetail };
});
export async function closureImpact(closure: string, page: number) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("closure_lesson_impact", {
      p_tenant: w.tenant.id,
      p_closure: id(closure),
      p_page: page,
    });
  checked(r.error);
  return r.data as unknown as ClosureImpact;
}
export async function exceptionDirectory(group: string, page: number) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("schedule_exception_directory", {
      p_tenant: w.tenant.id,
      p_group: id(group),
      p_page: page,
    });
  checked(r.error);
  return r.data as unknown as Directory<ScheduleException>;
}
export async function exceptionHistory(
  group: string,
  exception: string,
  page: number,
) {
  const w = await getWorkspace(),
    record = await w.supabase
      .from("group_schedule_exceptions")
      .select("id")
      .eq("tenant_id", w.tenant.id)
      .eq("group_id", id(group))
      .eq("id", id(exception))
      .single();
  if (record.error) notFound();
  const r = await w.supabase.rpc("academic_calendar_history", {
    p_tenant: w.tenant.id,
    p_closure: null,
    p_exception: exception,
    p_page: page,
  });
  checked(r.error);
  return r.data as unknown as AcademicHistory;
}
export async function generationSkips(batch: string, page: number) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("generation_skip_directory", {
      p_tenant: w.tenant.id,
      p_batch: id(batch),
      p_page: page,
    });
  checked(r.error);
  return r.data as unknown as Directory<GenerationSkip>;
}
export const lessonCalendarContext = cache(async (lesson: string) => {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("lesson_calendar_context", {
      p_tenant: w.tenant.id,
      p_lesson: id(lesson),
    });
  checked(r.error);
  return r.data as unknown as CalendarContext;
});
export async function scheduleChanges(search: AcademicSearch) {
  const workspace = await getWorkspace(),
    filters = academicFilters(search, ["branch", "from", "to"]),
    page = academicPage(search);
  filters.to ??= businessDate(workspace);
  filters.from ??= addDays(filters.to, -30);
  const r = await workspace.supabase.rpc("lesson_change_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  checked(r.error);
  return {
    workspace,
    filters,
    page,
    ...(r.data as unknown as Directory<ScheduleChange>),
  };
}
