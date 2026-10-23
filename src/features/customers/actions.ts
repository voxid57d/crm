"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, allScopes } from "@/features/workspace/context";
import { customerOptions, getCustomer } from "./queries";
import { text, email, uuid, InputError } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
import type { DuplicateState } from "./types";

function failed(error: unknown): ActionState {
  unstable_rethrow(error);
  return {
    error:
      error instanceof InputError
        ? error.message
        : "The change could not be saved. Check your permissions, field values, and local services.",
  };
}
async function context(form: FormData) {
  const workspace = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== workspace.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  return workspace;
}
function scope(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  branches: string[],
  permission: string,
) {
  if (
    branches.some((id) => !workspace.branches.some((b) => b.id === id)) ||
    !allScopes(workspace, branches, permission)
  )
    throw new InputError(
      "This action requires permission in every assigned branch.",
    );
}
async function target(form: FormData, permission: string) {
  const workspace = await context(form);
  const record = await getCustomer(uuid(form.get("customer_id")));
  scope(workspace, record.branchIds, permission);
  return record;
}
function date(form: FormData, name: string) {
  const value = text(form, name, { max: 10, label: name.replaceAll("_", " ") });
  if (
    value &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    throw new InputError("Enter a valid calendar date.");
  return value;
}
function refresh() {
  revalidatePath("/customers", "layout");
  revalidatePath("/students");
}
export async function saveCustomer(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let saved: string;
  try {
    const workspace = await context(form);
    const id = form.get("customer_id") ? uuid(form.get("customer_id")) : null;
    const branches = form.getAll("branch_ids").map(uuid);
    scope(workspace, branches, id ? "customers.update" : "customers.create");
    scope(workspace, branches, "customers.view");
    if (id) {
      const old = await getCustomer(id);
      scope(workspace, old.branchIds, "customers.update");
      if (old.customer.archived_at)
        throw new InputError("Restore this customer before editing.");
    }
    const options = await customerOptions();
    const fields: Record<string, string> = {};
    for (const field of options.fields.filter((f) => f.is_active))
      fields[field.id] = text(form, `field_${field.id}`, {
        max: 2000,
        label: field.name,
      });
    const student =
      form.get("student_enabled") === "on"
        ? {
            student_identifier: text(form, "student_identifier", {
              min: 1,
              max: 80,
              label: "Student identifier",
            }),
            education_status: text(form, "education_status"),
            school: text(form, "school", { max: 200 }),
            education_level: text(form, "education_level", { max: 150 }),
            learning_goals: text(form, "learning_goals", { max: 2000 }),
            additional_information: text(form, "additional_information", {
              max: 3000,
            }),
            enrollment_date: date(form, "enrollment_date"),
          }
        : null;
    const responsible = text(form, "responsible_employee_id");
    const status = text(form, "status_id");
    const result = await workspace.supabase.rpc("save_customer", {
      p_tenant: workspace.tenant.id,
      p_id: id,
      p_branches: branches,
      p_tags: form.getAll("tag_ids").map(uuid),
      p_fields: fields,
      p_student: student,
      p_profile: {
        first_name: text(form, "first_name", {
          min: 1,
          max: 100,
          label: "First name",
        }),
        last_name: text(form, "last_name", { max: 100, label: "Last name" }),
        phone: text(form, "phone", { min: 3, max: 40, label: "Phone" }),
        additional_phone: text(form, "additional_phone", { max: 40 }),
        email: email(form, "email", true),
        date_of_birth: date(form, "date_of_birth"),
        gender: text(form, "gender"),
        address: text(form, "address", { max: 1000 }),
        status_id: status ? uuid(status) : "",
        responsible_employee_id: responsible ? uuid(responsible) : "",
      },
    });
    if (result.error)
      return {
        error:
          result.error.code === "23505"
            ? "That student identifier is already in use in this business. Phone/email duplicates are allowed."
            : "Customer could not be saved. Check branch coverage, status, employee assignment, student fields, and custom field values.",
      };
    saved = result.data;
  } catch (error) {
    return failed(error);
  }
  refresh();
  redirect(`/customers/${saved}?saved=1`);
}
export async function archiveCustomer(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, customer } = await target(form, "customers.archive");
    const archive = text(form, "archive");
    if (!["true", "false"].includes(archive))
      throw new InputError("Choose archive or restore.");
    const result = await workspace.supabase.rpc("archive_customer", {
      p_tenant: workspace.tenant.id,
      p_customer: customer.id,
      p_archive: archive === "true",
    });
    if (result.error)
      return { error: "Archive/restore was denied. Check your permissions." };
    refresh();
    return {
      success:
        archive === "true"
          ? "Customer archived. Records and history are retained."
          : "Customer restored.",
    };
  } catch (error) {
    return failed(error);
  }
}
export async function saveSetting(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    const kind = text(form, "kind");
    if (!["status", "tag", "field"].includes(kind))
      throw new InputError("Unknown setting.");
    if (
      !workspace.businessPermissions.has(
        kind === "tag" ? "customers.manage_tags" : "customers.manage_settings",
      )
    )
      throw new InputError(
        "Business-wide customer configuration permission is required.",
      );
    const active = text(form, "is_active");
    if (!["true", "false"].includes(active))
      throw new InputError("Choose a setting status.");
    const result = await workspace.supabase.rpc("save_customer_setting", {
      p_tenant: workspace.tenant.id,
      p_id: form.get("id") ? uuid(form.get("id")) : null,
      p_kind: kind,
      p_name: text(form, "name", { min: 1, max: 80, label: "Name" }),
      p_type: text(form, "field_type") || "text",
      p_active: active === "true",
    });
    if (result.error)
      return {
        error:
          "Setting could not be saved. Names must be unique, field types cannot change, and the default customer status must stay active.",
      };
    refresh();
    return { success: "Customer configuration saved." };
  } catch (error) {
    return failed(error);
  }
}
export async function saveNote(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, customer, branchIds } = await target(
      form,
      "customers.manage_notes",
    );
    scope(workspace, branchIds, "customers.view_notes");
    const result = await workspace.supabase.rpc("save_customer_note", {
      p_tenant: workspace.tenant.id,
      p_customer: customer.id,
      p_id: form.get("note_id") ? uuid(form.get("note_id")) : null,
      p_body: text(form, "body", { min: 1, max: 5000, label: "Note" }),
      p_kind: text(form, "note_kind"),
    });
    if (result.error)
      return {
        error:
          "Note could not be saved. Only its author can edit it, and archived customers must be restored first.",
      };
    refresh();
    return { success: "Note saved with protected activity history." };
  } catch (error) {
    return failed(error);
  }
}
export async function saveGuardian(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, customer } = await target(form, "customers.update");
    const id = form.get("guardian_id") ? uuid(form.get("guardian_id")) : null;
    const result = await workspace.supabase.rpc("save_student_guardian", {
      p_tenant: workspace.tenant.id,
      p_customer: customer.id,
      p_guardian: id,
      p_full_name: text(form, "full_name", {
        min: id ? 0 : 1,
        max: 150,
        label: "Guardian name",
      }),
      p_phone: text(form, "phone", { max: 40, label: "Phone" }),
      p_email: email(form, "email", true),
      p_relationship: text(form, "relationship", {
        min: 1,
        max: 80,
        label: "Relationship",
      }),
      p_emergency: form.get("is_emergency") === "on",
    });
    if (result.error)
      return {
        error:
          "Guardian could not be saved. Editing shared contact details requires access to every linked student. Check name, phone, and student status.",
      };
    refresh();
    return { success: "Guardian relationship saved." };
  } catch (error) {
    return failed(error);
  }
}
export async function unlinkGuardian(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, customer } = await target(form, "customers.update");
    const result = await workspace.supabase.rpc("unlink_student_guardian", {
      p_tenant: workspace.tenant.id,
      p_customer: customer.id,
      p_guardian: uuid(form.get("guardian_id")),
    });
    if (result.error)
      return { error: "Guardian relationship could not be removed." };
    refresh();
    return {
      success:
        "Guardian unlinked from this student. Contact and history retained.",
    };
  } catch (error) {
    return failed(error);
  }
}
export async function findDuplicates(
  _state: DuplicateState,
  form: FormData,
): Promise<DuplicateState> {
  try {
    const workspace = await context(form);
    const result = await workspace.supabase.rpc(
      "customer_duplicate_candidates",
      {
        p_tenant: workspace.tenant.id,
        p_phone: text(form, "phone", { max: 40 }),
        p_email: email(form, "email", true),
        p_name: text(form, "name", { max: 200 }),
        ...(form.get("customer_id")
          ? { p_exclude: uuid(form.get("customer_id")) }
          : {}),
      },
    );
    if (result.error) return { error: "Duplicate search could not load." };
    return { matches: result.data };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error:
        error instanceof InputError
          ? error.message
          : "Duplicate search could not load.",
    };
  }
}
