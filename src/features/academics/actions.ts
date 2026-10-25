"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { text, uuid, InputError } from "@/lib/validation.mjs";
import { moneyInput } from "@/features/finance/money.mjs";
import { canManageCourses, canClassroom, getClassroom } from "./queries";
import type { ActionState } from "@/features/shared/action-state";
import type { AcademicKind } from "./types";
function fail(e: unknown): ActionState {
  unstable_rethrow(e);
  return {
    error:
      e instanceof InputError
        ? e.message
        : "Academic change rejected. Check permissions, resource values and local services.",
  };
}
function databaseError(e: { code?: string; message: string }): ActionState {
  return {
    error:
      e.code === "40001"
        ? "This record changed. Reload before saving; your change was not applied."
        : e.code === "23505"
          ? "That course code, setting name or classroom name is already in use. Edit the existing record or choose another value."
          : e.message.includes("request identifier")
            ? "This form was already used with different details. Reload before making another change."
            : "Save rejected. Check active same-business categories/levels, branch permissions, valid capacity/duration and exact nonnegative price. No partial change was saved.",
  };
}
async function context(form: FormData) {
  const w = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== w.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  return w;
}
function version(form: FormData) {
  const s = text(form, "version");
  if (!/^(0|[1-9][0-9]{0,9})$/.test(s) || Number(s) > 2147483646)
    throw new InputError("Reload this record before saving.");
  return Number(s);
}
function whole(form: FormData, name: string, max: number, optional = false) {
  const s = text(form, name, { max: 5, label: name.replaceAll("_", " ") });
  if (s === "" && optional) return "";
  if (!/^[0-9]{1,5}$/.test(s) || Number(s) < 1 || Number(s) > max)
    throw new InputError(
      `${name.replaceAll("_", " ")} must be a whole number from 1 to ${max}.`,
    );
  return s;
}
function refresh() {
  revalidatePath("/courses", "layout");
  revalidatePath("/classrooms", "layout");
}
export async function saveCourse(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form);
    if (!canManageCourses(w))
      throw new InputError(
        "Business-wide course viewing and management permission is required.",
      );
    const existing = text(form, "course_id"),
      price = text(form, "standard_price", {
        min: 1,
        max: 19,
        label: "Standard price",
      });
    const category = text(form, "category_id"),
      level = text(form, "level_id");
    const r = await w.supabase.rpc("save_course", {
      p_tenant: w.tenant.id,
      p_id: existing ? uuid(existing) : null,
      p_request: uuid(form.get("request_id")),
      p_version: version(form),
      p_data: {
        name: text(form, "name", { min: 1, max: 150, label: "Course name" }),
        code: text(form, "code", { max: 40 }),
        description: text(form, "description", { max: 6000 }),
        category_id: category ? uuid(category) : "",
        level_id: level ? uuid(level) : "",
        duration_value: whole(form, "duration_value", 10000, true),
        duration_unit: text(form, "duration_unit"),
        lesson_duration_minutes: whole(
          form,
          "lesson_duration_minutes",
          1440,
          true,
        ),
        standard_price: /^0(?:\.0{1,2})?$/.test(price)
          ? "0.00"
          : moneyInput(price),
        pricing_model: text(form, "pricing_model"),
        currency: "UZS",
      },
    });
    if (r.error) return databaseError(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/courses/${id}?saved=1`);
}
export async function saveClassroom(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form),
      existing = text(form, "classroom_id"),
      branch = uuid(form.get("branch_id"));
    assertPermission(w, "classrooms.view", branch);
    assertPermission(w, "classrooms.manage", branch);
    if (existing) {
      const old = await getClassroom(uuid(existing));
      if (
        old.detail.classroom.branch_id !== branch ||
        !canClassroom(w, "classrooms.manage", old.detail.classroom.branch_id)
      )
        throw new InputError("This classroom's branch cannot change.");
    }
    const r = await w.supabase.rpc("save_classroom", {
      p_tenant: w.tenant.id,
      p_id: existing ? uuid(existing) : null,
      p_request: uuid(form.get("request_id")),
      p_version: version(form),
      p_data: {
        branch_id: branch,
        name: text(form, "name", { min: 1, max: 100, label: "Classroom name" }),
        description: text(form, "description", { max: 2000 }),
        capacity: whole(form, "capacity", 10000),
      },
    });
    if (r.error) return databaseError(r.error);
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/classrooms/${id}?saved=1`);
}
export async function saveCourseSetting(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let location = "/courses/settings?saved=1";
  try {
    const w = await context(form);
    if (!canManageCourses(w))
      throw new InputError("Business-wide course management is required.");
    const kind = text(form, "kind"),
      existing = text(form, "setting_id"),
      active = text(form, "is_active");
    if (
      !["category", "level"].includes(kind) ||
      !["true", "false"].includes(active)
    )
      throw new InputError("Choose a valid setting and status.");
    const r = await w.supabase.rpc("save_course_setting", {
      p_tenant: w.tenant.id,
      p_kind: kind,
      p_id: existing ? uuid(existing) : null,
      p_request: uuid(form.get("request_id")),
      p_version: version(form),
      p_name: text(form, "name", { min: 1, max: 100, label: "Setting name" }),
      p_active: active === "true",
    });
    if (r.error) return databaseError(r.error);
    location = `/courses/settings?kind=${kind}&saved=1`;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(location);
}
export async function setAcademicActive(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let kind: AcademicKind, id: string;
  try {
    const w = await context(form),
      value = text(form, "kind"),
      active = text(form, "is_active");
    if (
      !["course", "classroom", "category", "level"].includes(value) ||
      !["true", "false"].includes(active)
    )
      throw new InputError("Choose a supported resource and status.");
    kind = value as AcademicKind;
    id = uuid(form.get("resource_id"));
    if (kind === "classroom") {
      const { detail } = await getClassroom(id);
      assertPermission(w, "classrooms.view", detail.classroom.branch_id);
      assertPermission(w, "classrooms.manage", detail.classroom.branch_id);
    } else if (!canManageCourses(w))
      throw new InputError("Business-wide course management is required.");
    if (form.get("confirm") !== "on")
      throw new InputError("Confirm the status change.");
    const r = await w.supabase.rpc("set_academic_active", {
      p_tenant: w.tenant.id,
      p_kind: kind,
      p_id: id,
      p_request: uuid(form.get("request_id")),
      p_version: version(form),
      p_active: active === "true",
      p_reason: text(form, "reason", { max: 1000 }),
    });
    if (r.error) return databaseError(r.error);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(
    kind === "course"
      ? `/courses/${id}?saved=1`
      : kind === "classroom"
        ? `/classrooms/${id}?saved=1`
        : "/courses/settings?saved=1",
  );
}
