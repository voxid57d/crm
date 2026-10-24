"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, allScopes } from "@/features/workspace/context";
import { customerOptions, getCustomer } from "./queries";
import { text, email, uuid, InputError } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
import type { DuplicateState } from "./types";
import { parseCustomerForm } from "./parsers";

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
function refresh() {
  revalidatePath("/customers", "layout");
  revalidatePath("/students", "layout");
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
    const result = await workspace.supabase.rpc("save_customer", {
      p_tenant: workspace.tenant.id,
      p_id: id,
      ...parseCustomerForm(form, options),
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
export async function saveStudent(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let saved: string;
  try {
    const workspace = await context(form),
      id = form.get("customer_id") ? uuid(form.get("customer_id")) : null,
      old = id ? await getCustomer(id) : null;
    if (old) {
      scope(workspace, old.branchIds, "customers.update");
      if (old.customer.archived_at)
        throw new InputError(
          "Restore this contact before adding or editing its student profile.",
        );
    }
    const options = await customerOptions(),
      input = parseCustomerForm(form, options, true);
    scope(
      workspace,
      input.p_branches,
      id ? "customers.update" : "customers.create",
    );
    scope(workspace, input.p_branches, "customers.view");
    if (!input.p_student) throw new InputError("Student details are required.");
    const mode = text(form, "student_mode");
    if (
      !["create", "edit"].includes(mode) ||
      (mode === "edit" && !old?.student)
    )
      throw new InputError(
        "This student form is no longer valid. Reload before saving.",
      );
    const r = await workspace.supabase.rpc("save_student", {
      p_tenant: workspace.tenant.id,
      p_request: uuid(form.get("request_id")),
      p_customer: id,
      ...input,
      p_student: input.p_student,
      p_mode: mode,
      p_confirm_duplicate: form.get("separate_contact") === "on",
    });
    if (r.error)
      return {
        error:
          r.error.code === "23505"
            ? "That student identifier is already in use. Reuse the existing student or choose another identifier."
            : r.error.message.startsWith("Possible existing")
              ? "Possible existing contact or student. Check matches above and use the existing contact, or confirm this is a separate person."
              : r.error.message.includes("request identifier")
                ? "This form was already used with different details. Reload before saving another change."
                : "Student could not save. Check branch permissions, student fields, active contact status and employee assignment. All changes were rolled back.",
      };
    saved = r.data;
  } catch (e) {
    return failed(e);
  }
  refresh();
  redirect(`/students/${saved}?saved=1`);
}
export async function archiveCustomer(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, customer, student } = await target(
      form,
      "customers.archive",
    );
    const entity =
      form.get("student_first") === "on" && student ? "Student" : "Customer";
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
          ? `${entity} archived. Records and history are retained.`
          : `${entity} restored.`,
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
