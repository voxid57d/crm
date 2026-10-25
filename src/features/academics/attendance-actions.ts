"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { InputError, text, uuid } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
import { getAttendance } from "./attendance-queries";
import { attendanceStatuses } from "./attendance-types";
type Operation = "prepare" | "save" | "correct" | "finalize" | "refresh";
async function change(
  operation: Operation,
  form: FormData,
): Promise<ActionState> {
  let lesson: string,
    page = "0";
  try {
    const w = await getWorkspace();
    if (uuid(form.get("tenant_id")) !== w.tenant.id)
      throw new InputError("Business changed. Reload before saving.");
    lesson = uuid(form.get("lesson_id"));
    const { detail: d } = await getAttendance(lesson);
    const allowed =
      operation === "correct"
        ? d.can_correct
        : operation === "finalize"
          ? d.can_finalize
          : d.can_manage;
    if (!allowed)
      throw new InputError(
        "You cannot perform this attendance action in the current lesson and sheet state.",
      );
    const v = text(form, "version");
    if (!/^(0|[1-9][0-9]{0,8})$/.test(v))
      throw new InputError("Reload the attendance sheet before saving.");
    page = text(form, "page");
    if (!/^[0-9]{1,6}$/.test(page)) page = "0";
    const common = {
        p_tenant: w.tenant.id,
        p_lesson: lesson,
        p_request: uuid(form.get("request_id")),
      },
      version = Number(v);
    let r;
    if (operation === "prepare")
      r = await w.supabase.rpc("prepare_attendance_sheet", common);
    else if (operation === "refresh")
      r = await w.supabase.rpc("refresh_attendance_roster", {
        ...common,
        p_version: version,
      });
    else if (operation === "finalize") {
      if (form.get("confirm_finalization") !== "on")
        throw new InputError("Confirm the saved marks and finalization first.");
      r = await w.supabase.rpc("finalize_attendance_sheet", {
        ...common,
        p_version: version,
        p_confirm_empty: form.get("confirm_empty") === "on",
      });
    } else {
      const ids = form.getAll("record_id"),
        statuses = form.getAll("attendance_status"),
        notes = form.getAll("attendance_note"),
        minutes = form.getAll("late_minutes");
      if (
        ids.length < 1 ||
        ids.length > 200 ||
        [statuses, notes, minutes].some((x) => x.length !== ids.length)
      )
        throw new InputError("Submit complete attendance rows from this page.");
      const marks = ids.map((id, i) => {
        if (
          typeof statuses[i] !== "string" ||
          !attendanceStatuses.some((s) => s === statuses[i]) ||
          typeof notes[i] !== "string" ||
          String(notes[i]).length > 1000 ||
          typeof minutes[i] !== "string"
        )
          throw new InputError(
            "Choose valid marks and notes of at most 1000 characters.",
          );
        return {
          record_id: uuid(id),
          status: String(statuses[i]),
          notes: String(notes[i]),
          late_minutes: String(minutes[i]),
        };
      });
      r = await w.supabase.rpc("save_attendance_marks", {
        ...common,
        p_version: version,
        p_marks: marks,
        p_correct: operation === "correct",
        p_reason: text(form, "reason", {
          min: operation === "correct" ? 3 : 0,
          max: 1000,
          label: "Correction reason",
        }),
      });
    }
    if (r.error) {
      const known = [
        "Attendance changed",
        "Mark every",
        "Explicitly confirm",
        "Enrollment roster changed",
        "Clear affected",
        "A finalized correction",
        "Change at least",
        "Late minutes",
        "Attendance can be finalized",
        "Enrollment activation history",
        "Finalized attendance",
        "Cancelled and rescheduled",
      ];
      return {
        error:
          r.error.code === "40001"
            ? "Attendance changed. Reload before saving; nothing was overwritten."
            : known.some((s) => r.error!.message.startsWith(s))
              ? r.error.message
              : "Attendance save rejected. Check actual lesson permission, roster rows, status, notes and dates. All changes were rolled back.",
      };
    }
  } catch (e) {
    unstable_rethrow(e);
    return {
      error:
        e instanceof InputError
          ? e.message
          : "Attendance could not be saved. Check access and local services.",
    };
  }
  for (const path of [
    "/attendance",
    "/lessons",
    "/groups",
    "/students",
    "/customers",
    "/academics",
  ])
    revalidatePath(path, "layout");
  redirect(`/lessons/${lesson}/attendance?page=${page}&saved=1`);
}
export async function prepareAttendance(_s: ActionState, f: FormData) {
  return change("prepare", f);
}
export async function saveAttendance(_s: ActionState, f: FormData) {
  return change("save", f);
}
export async function correctAttendance(_s: ActionState, f: FormData) {
  return change("correct", f);
}
export async function finalizeAttendance(_s: ActionState, f: FormData) {
  return change("finalize", f);
}
export async function refreshAttendanceRoster(_s: ActionState, f: FormData) {
  return change("refresh", f);
}
