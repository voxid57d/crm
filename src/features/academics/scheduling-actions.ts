"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { text, uuid, InputError } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
import { getGroup } from "./group-queries";
import { getSlot, getLesson } from "./scheduling-queries";
import type { GenerationBatch } from "./scheduling-types";
function fail(e: unknown): ActionState {
  unstable_rethrow(e);
  return {
    error:
      e instanceof InputError
        ? e.message
        : "Scheduling change could not be saved. Verify permissions and local services.",
  };
}
function rejected(e: { code?: string; message: string }): ActionState {
  const known = [
    "Ambiguous",
    "Choose a valid",
    "Choose an active",
    "Choose a planned",
    "Lesson dates",
    "Primary teacher",
    "Substitute must",
    "Schedule dates",
    "Schedule revisions",
    "Only the latest",
    "Only upcoming",
    "Completed and terminal",
    "Use rescheduling",
    "Lesson cannot",
    "Activate the group",
    "End current/future",
    "Finish or cancel",
    "Group capacity",
    "Classroom capacity",
    "Reschedule an upcoming",
    "Past schedule",
  ];
  return {
    error:
      e.code === "40001"
        ? "This record changed. Reload before saving; your changes were not applied."
        : e.code === "23P01"
          ? "Scheduling conflict: the group, teaching employee or classroom is already reserved. Choose another time or resource. No partial change was saved."
          : e.message.includes("identifier")
            ? "This form was already used with different details. Reload before making another change."
            : known.some((p) => e.message.startsWith(p))
              ? e.message
              : "Save rejected. Check resource eligibility, branch access, timezone, date range, status and reason. All changes were rolled back.",
  };
}
async function context(f: FormData) {
  const w = await getWorkspace();
  if (uuid(f.get("tenant_id")) !== w.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  return w;
}
function version(f: FormData) {
  const v = text(f, "version");
  if (!/^(0|[1-9][0-9]{0,9})$/.test(v) || Number(v) > 2147483646)
    throw new InputError("Reload the record before saving.");
  return Number(v);
}
function date(f: FormData, key: string) {
  const v = text(f, key, { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new InputError("Enter a valid date.");
  return v;
}
function datetime(f: FormData, key: string) {
  const v = text(f, key, { min: 16, max: 16 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))
    throw new InputError("Enter a valid local date and time.");
  return v;
}
function lessonData(f: FormData) {
  const room = text(f, "classroom_id"),
    sub = text(f, "substitute_id");
  return {
    local_start: datetime(f, "local_start"),
    local_end: datetime(f, "local_end"),
    timezone: text(f, "timezone", { min: 1, max: 100 }),
    teacher_id: uuid(f.get("teacher_id")),
    substitute_id: sub ? uuid(sub) : "",
    classroom_id: room ? uuid(room) : "",
    title: text(f, "title", { min: 1, max: 200 }),
    notes: text(f, "notes", { max: 5000 }),
  };
}
function refresh() {
  for (const path of [
    "/groups",
    "/lessons",
    "/timetable",
    "/classrooms",
    "/academics",
    "/students",
    "/customers",
  ])
    revalidatePath(path, "layout");
}
export async function saveSchedule(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let group: string, id: string;
  try {
    const w = await context(f);
    group = uuid(f.get("group_id"));
    const g = await getGroup(group),
      old = text(f, "slot_id");
    assertPermission(w, "schedules.manage", g.detail.group.branch_id);
    if (old) {
      const s = await getSlot(uuid(old));
      if (s.detail.slot.group_id !== group)
        throw new InputError("Schedule group cannot change.");
    }
    const room = text(f, "classroom_id");
    const r = await w.supabase.rpc("save_group_schedule", {
      p_tenant: w.tenant.id,
      p_group: group,
      p_id: old ? uuid(old) : null,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_data: {
        weekday: text(f, "weekday"),
        start_time: text(f, "start_time", { min: 5, max: 5 }),
        end_time: text(f, "end_time", { min: 5, max: 5 }),
        timezone: text(f, "timezone", { min: 1, max: 100 }),
        effective_from: date(f, "effective_from"),
        effective_to: date(f, "effective_to"),
        teacher_id: uuid(f.get("teacher_id")),
        classroom_id: room ? uuid(room) : "",
      },
      p_reason: text(f, "reason", { min: 3, max: 1000 }),
    });
    if (r.error) return rejected(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/groups/${group}/schedules/${id}?saved=1`);
}
export async function endSchedule(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let group: string, id: string;
  try {
    const w = await context(f);
    id = uuid(f.get("slot_id"));
    const s = await getSlot(id);
    group = s.detail.slot.group_id;
    assertPermission(w, "schedules.manage", s.detail.slot.branch_id);
    if (f.get("confirm") !== "on")
      throw new InputError("Confirm ending this schedule period.");
    const r = await w.supabase.rpc("end_group_schedule", {
      p_tenant: w.tenant.id,
      p_slot: id,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_from: date(f, "stop_from"),
      p_reason: text(f, "reason", { min: 3, max: 1000 }),
    });
    if (r.error) return rejected(r.error);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/groups/${group}/schedules/${id}?saved=1`);
}
export async function generateLessons(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let group: string, batch: string;
  try {
    const w = await context(f);
    group = uuid(f.get("group_id"));
    const g = await getGroup(group);
    assertPermission(w, "schedules.manage", g.detail.group.branch_id);
    assertPermission(w, "lessons.manage", g.detail.group.branch_id);
    const r = await w.supabase.rpc("generate_group_lessons", {
      p_tenant: w.tenant.id,
      p_group: group,
      p_request: uuid(f.get("request_id")),
      p_from: date(f, "from"),
      p_to: date(f, "to"),
    });
    if (r.error) return rejected(r.error);
    batch = (r.data as unknown as GenerationBatch).id;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/groups/${group}/schedules?batch=${batch}`);
}
export async function saveLesson(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f),
      group = uuid(f.get("group_id")),
      old = text(f, "lesson_id"),
      g = await getGroup(group);
    assertPermission(w, "lessons.manage", g.detail.group.branch_id);
    if (old) {
      const l = await getLesson(uuid(old));
      if (l.detail.lesson.group_id !== group)
        throw new InputError("Lesson group cannot change.");
    }
    const r = await w.supabase.rpc("save_lesson", {
      p_tenant: w.tenant.id,
      p_group: group,
      p_id: old ? uuid(old) : null,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_data: lessonData(f),
      p_reason: text(f, "reason", { min: 3, max: 1000 }),
    });
    if (r.error) return rejected(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/lessons/${id}?saved=1`);
}
export async function changeLessonStatus(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f);
    id = uuid(f.get("lesson_id"));
    const l = await getLesson(id),
      state = text(f, "status");
    if (state === "cancelled")
      assertPermission(w, "lessons.manage", l.detail.lesson.branch_id);
    else if (!l.detail.can_manage)
      assertPermission(w, "lessons.complete", l.detail.lesson.branch_id);
    if (f.get("confirm") !== "on")
      throw new InputError("Confirm the lesson status change.");
    const r = await w.supabase.rpc("transition_lesson", {
      p_tenant: w.tenant.id,
      p_lesson: id,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_status: state,
      p_reason: text(f, "reason", { min: 3, max: 1000 }),
    });
    if (r.error) return rejected(r.error);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/lessons/${id}?saved=1`);
}
export async function rescheduleLesson(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f),
      source = uuid(f.get("lesson_id")),
      l = await getLesson(source);
    assertPermission(w, "lessons.manage", l.detail.lesson.branch_id);
    const r = await w.supabase.rpc("reschedule_lesson", {
      p_tenant: w.tenant.id,
      p_lesson: source,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_data: lessonData(f),
      p_reason: text(f, "reason", { min: 3, max: 1000 }),
    });
    if (r.error) return rejected(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/lessons/${id}?saved=1`);
}
