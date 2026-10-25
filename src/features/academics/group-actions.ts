"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { text, uuid, InputError } from "@/lib/validation.mjs";
import { moneyInput } from "@/features/finance/money.mjs";
import type { ActionState } from "@/features/shared/action-state";
import { getGroup, getEnrollment } from "./group-queries";
function fail(e: unknown): ActionState {
  unstable_rethrow(e);
  return {
    error:
      e instanceof InputError
        ? e.message
        : "Academic change rejected. Check authorization and local services.",
  };
}
function rejected(e: { code?: string; message: string }): ActionState {
  const known = [
    "Group is at capacity",
    "Capacity cannot be below reserved seats",
    "Explicit authorized student branch addition required",
    "Every teacher must",
    "Close reserved enrollments",
    "Choose an active",
    "Archived courses",
    "Enrollment dates",
    "Transfer must",
    "A completed/withdrawn",
    "Unsupported",
    "Terminal",
    "Group branch",
    "An established",
  ];
  return {
    error:
      e.code === "40001"
        ? "This record changed. Reload before saving; no changes were applied."
        : e.code === "23505"
          ? "That group code or open student enrollment already exists. Reuse the existing record."
          : e.message.includes("identifier")
            ? "This form was already used with different details. Reload before trying again."
            : known.some((s) => e.message.startsWith(s))
              ? e.message
              : "Save rejected. Check actual branch permissions, active student/teacher resources, dates, status, capacity and exact price. All changes were rolled back.",
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
function date(f: FormData, name: string, optional = false) {
  const v = text(f, name, { max: 10 });
  if (!v && optional) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new InputError("Enter a valid date.");
  return v;
}
function agreement(f: FormData, transfer = false) {
  const price = text(f, "agreed_price", { min: 1, max: 19 });
  return {
    agreed_price: /^0(?:\.0{1,2})?$/.test(price) ? "0.00" : moneyInput(price),
    pricing_model: text(f, "pricing_model"),
    currency: "UZS",
    status: text(f, "status"),
    enrollment_date: transfer ? "" : date(f, "enrollment_date"),
    effective_start_date: transfer ? "" : date(f, "effective_start_date"),
    effective_end_date: date(f, "effective_end_date", true),
    notes: text(f, "notes", { max: 3000 }),
  };
}
function refresh() {
  for (const path of ["/groups", "/enrollments", "/students", "/courses"])
    revalidatePath(path, "layout");
}
export async function saveGroup(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f),
      old = text(f, "group_id"),
      branch = uuid(f.get("branch_id"));
    assertPermission(w, "groups.view", branch);
    assertPermission(w, old ? "groups.update" : "groups.create", branch);
    if (old) {
      const g = await getGroup(uuid(old));
      if (g.detail.group.branch_id !== branch)
        throw new InputError("Group branch cannot change.");
    }
    const capacity = text(f, "capacity", { min: 1, max: 5 });
    if (
      !/^[0-9]{1,5}$/.test(capacity) ||
      Number(capacity) < 1 ||
      Number(capacity) > 10000
    )
      throw new InputError("Capacity must be a whole number from 1 to 10000.");
    const room = text(f, "classroom_id"),
      r = await w.supabase.rpc("save_study_group", {
        p_tenant: w.tenant.id,
        p_id: old ? uuid(old) : null,
        p_request: uuid(f.get("request_id")),
        p_version: version(f),
        p_data: {
          branch_id: branch,
          course_id: uuid(f.get("course_id")),
          name: text(f, "name", { min: 1, max: 150 }),
          code: text(f, "code", { max: 40 }),
          start_date: date(f, "start_date"),
          end_date: date(f, "end_date", true),
          capacity,
          classroom_id: room ? uuid(room) : "",
        },
      });
    if (r.error) return rejected(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/groups/${id}?saved=1`);
}
export async function changeGroupStatus(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f);
    id = uuid(f.get("group_id"));
    const g = await getGroup(id),
      state = text(f, "status");
    assertPermission(
      w,
      state === "archived" ? "groups.archive" : "groups.update",
      g.detail.group.branch_id,
    );
    if (f.get("confirm") !== "on")
      throw new InputError("Confirm the group status change.");
    const r = await w.supabase.rpc("change_group_status", {
      p_tenant: w.tenant.id,
      p_group: id,
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
  redirect(`/groups/${id}?saved=1`);
}
export async function saveTeachers(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f);
    id = uuid(f.get("group_id"));
    const g = await getGroup(id);
    assertPermission(w, "groups.assign_teachers", g.detail.group.branch_id);
    const ids = f.getAll("employee_ids").map(uuid),
      primary = text(f, "primary_id");
    const r = await w.supabase.rpc("set_group_teachers", {
      p_tenant: w.tenant.id,
      p_group: id,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_employees: ids,
      p_primary: primary ? uuid(primary) : null,
      p_reason: text(f, "reason", { max: 1000 }),
    });
    if (r.error) return rejected(r.error);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/groups/${id}?saved=1`);
}
export async function createEnrollment(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f),
      group = uuid(f.get("group_id")),
      g = await getGroup(group);
    assertPermission(w, "enrollments.create", g.detail.group.branch_id);
    assertPermission(w, "enrollments.view_pricing", g.detail.group.branch_id);
    const r = await w.supabase.rpc("create_student_enrollment", {
      p_tenant: w.tenant.id,
      p_group: group,
      p_student: uuid(f.get("student_id")),
      p_request: uuid(f.get("request_id")),
      p_data: agreement(f),
      p_add_branch: f.get("add_branch") === "on",
    });
    if (r.error) return rejected(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/enrollments/${id}?saved=1`);
}
export async function updateEnrollment(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f);
    id = uuid(f.get("enrollment_id"));
    const e = await getEnrollment(id);
    assertPermission(w, "enrollments.update", e.detail.enrollment.branch_id);
    const r = await w.supabase.rpc("update_student_enrollment", {
      p_tenant: w.tenant.id,
      p_enrollment: id,
      p_request: uuid(f.get("request_id")),
      p_version: version(f),
      p_data: {
        status: text(f, "status"),
        effective_start_date: date(f, "effective_start_date"),
        effective_end_date: date(f, "effective_end_date", true),
        notes: text(f, "notes", { max: 3000 }),
        reason: text(f, "reason", { min: 3, max: 1000 }),
      },
    });
    if (r.error) return rejected(r.error);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/enrollments/${id}?saved=1`);
}
export async function transferEnrollment(
  _s: ActionState,
  f: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(f),
      source = uuid(f.get("enrollment_id")),
      target = uuid(f.get("target_id")),
      e = await getEnrollment(source),
      g = await getGroup(target);
    assertPermission(w, "enrollments.transfer", e.detail.enrollment.branch_id);
    assertPermission(w, "enrollments.transfer", g.detail.group.branch_id);
    assertPermission(w, "enrollments.create", g.detail.group.branch_id);
    const data = agreement(f, true),
      r = await w.supabase.rpc("transfer_student_enrollment", {
        p_tenant: w.tenant.id,
        p_enrollment: source,
        p_target: target,
        p_request: uuid(f.get("request_id")),
        p_version: version(f),
        p_date: date(f, "transfer_date"),
        p_data: data,
        p_reason: text(f, "reason", { min: 3, max: 1000 }),
        p_add_branch: f.get("add_branch") === "on",
      });
    if (r.error) return rejected(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/enrollments/${id}?saved=1`);
}
