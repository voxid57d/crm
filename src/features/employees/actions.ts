"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { getWorkspace } from "@/features/workspace/context";
import { requireUser } from "@/features/auth/session";
import { saveSelection } from "@/features/workspace/selection";
import {
  text,
  email,
  uuid,
  InputError,
  localAppOrigin,
} from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";

function failure(error: unknown): ActionState {
  unstable_rethrow(error);
  return {
    error:
      error instanceof InputError
        ? error.message
        : "The change could not be saved. Verify your permissions, inputs, and local migrations.",
  };
}
async function context(form: FormData) {
  const workspace = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== workspace.tenant.id)
    throw new InputError("Business selection changed. Reload before saving.");
  return workspace;
}
function requireBranches(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  branches: string[],
  permission: string,
) {
  if (branches.some((id) => !workspace.branches.some((b) => b.id === id)))
    throw new InputError("A branch is outside your business access.");
  if (
    !workspace.businessPermissions.has(permission) &&
    (!branches.length ||
      branches.some(
        (id) => !workspace.branchPermissions.get(id)?.has(permission),
      ))
  )
    throw new InputError(
      "Your role does not permit this operation in every assigned branch.",
    );
}
async function employee(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  id: string,
  permission: string,
) {
  const { data, error } = await workspace.supabase
    .from("employees")
    .select("*")
    .eq("tenant_id", workspace.tenant.id)
    .eq("id", id)
    .single();
  if (error)
    throw new InputError(
      "Employee is unavailable within your authorized scope.",
    );
  const branches = await workspace.supabase
    .from("employee_branches")
    .select("branch_id")
    .eq("tenant_id", workspace.tenant.id)
    .eq("employee_id", id);
  if (branches.error)
    throw new InputError("Employee assignments could not load.");
  requireBranches(
    workspace,
    branches.data.map((b) => b.branch_id),
    permission,
  );
  return data;
}
export async function saveEmployee(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let saved: string | null = null;
  try {
    const workspace = await context(form);
    const id = form.get("employee_id") ? uuid(form.get("employee_id")) : null;
    const branchIds = form.getAll("branch_ids").map(uuid);
    requireBranches(
      workspace,
      branchIds,
      id ? "employees.update" : "employees.create",
    );
    const previous = id
      ? await employee(workspace, id, "employees.update")
      : null;
    const status = text(form, "status");
    if (!["active", "inactive", "archived"].includes(status))
      throw new InputError("Choose an employment status.");
    if (status === "archived" || previous?.status === "archived") {
      requireBranches(workspace, branchIds, "employees.archive");
      if (id) await employee(workspace, id, "employees.archive");
    }
    const startDate = text(form, "start_date", {
      min: 10,
      max: 10,
      label: "Start date",
    });
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      Number.isNaN(Date.parse(startDate)) ||
      new Date(startDate).toISOString().slice(0, 10) !== startDate
    )
      throw new InputError("Enter a valid start date.");
    const result = await workspace.supabase.rpc("save_employee", {
      p_tenant: workspace.tenant.id,
      p_id: id,
      p_full_name: text(form, "full_name", {
        min: 1,
        max: 150,
        label: "Full name",
      }),
      p_phone: text(form, "phone", { max: 40, label: "Phone" }),
      p_email: email(form, "email", true),
      p_job_title: text(form, "job_title", { max: 150, label: "Job title" }),
      p_status: status,
      p_start_date: startDate,
      p_notes: text(form, "notes", { max: 5000, label: "Notes" }),
      p_branches: branchIds,
    });
    if (result.error)
      return {
        error:
          result.error.code === "23505"
            ? "An employee with this email is already recorded in this business. Open that profile instead."
            : "Employee could not be saved. Check your scope and permissions. Linked login assignment changes require role management access.",
      };
    saved = result.data;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  redirect(`/employees/${saved}?saved=1`);
}
export async function archiveEmployee(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    const id = uuid(form.get("employee_id"));
    await employee(workspace, id, "employees.archive");
    const result = await workspace.supabase.rpc("archive_employee", {
      p_tenant: workspace.tenant.id,
      p_employee: id,
    });
    if (result.error)
      return {
        error:
          "Employee archive was denied. Verify your scope and permissions.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return {
    success:
      "Employee archived. History is retained and CRM access in this business is blocked.",
  };
}
export async function saveSalary(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    const id = uuid(form.get("employee_id"));
    await employee(workspace, id, "salaries.view");
    await employee(workspace, id, "salaries.manage");
    const amount = (key: string, percentage = false) => {
      const value = text(form, key, { max: 24, label: key });
      if (
        value &&
        !(percentage ? /^\d{1,3}(\.\d{1,4})?$/ : /^\d{1,16}(\.\d{1,2})?$/).test(
          value,
        )
      )
        throw new InputError(
          "Use plain non-negative decimal values; amounts allow 2 decimal places, percentages 4.",
        );
      return value;
    };
    const type = text(form, "salary_type");
    if (
      ![
        "none",
        "fixed_monthly",
        "hourly",
        "per_lesson",
        "percentage",
        "base_bonus",
      ].includes(type)
    )
      throw new InputError("Choose a salary type.");
    const currency = text(form, "currency", {
      min: 3,
      max: 3,
      label: "Currency",
    }).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new InputError("Use a three-letter currency code.");
    const result = await workspace.supabase.rpc("save_employee_salary", {
      p_tenant: workspace.tenant.id,
      p_employee: id,
      p_type: type,
      p_amount: amount("amount"),
      p_percentage: amount("percentage", true),
      p_bonus_amount: amount("bonus_amount"),
      p_bonus_percentage: amount("bonus_percentage", true),
      p_bonus_basis: text(form, "bonus_basis", {
        max: 1000,
        label: "Compensation basis",
      }),
      p_currency: currency,
      p_reason: text(form, "reason", {
        min: 3,
        max: 1000,
        label: "Change reason",
      }),
    });
    if (result.error)
      return {
        error:
          "Salary configuration was rejected. Check type-specific values, percentage limits, and permissions. Archived employees must be restored first.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/employees", "layout");
  return { success: "Salary configuration saved with an audit entry." };
}
export async function saveRole(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    if (!workspace.businessPermissions.has("roles.manage"))
      throw new InputError("Role management permission is required.");
    const result = await workspace.supabase.rpc("save_business_role", {
      p_tenant: workspace.tenant.id,
      p_id: form.get("role_id") ? uuid(form.get("role_id")) : null,
      p_name: text(form, "name", { min: 1, max: 80, label: "Role name" }),
      p_scope: text(form, "scope"),
      p_permissions: form.getAll("permissions").map((value) => String(value)),
    });
    if (result.error)
      return {
        error:
          "Role could not be saved. System roles and existing scopes are immutable, names must be unique, and you cannot delegate permissions you do not hold.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Role and permission configuration saved." };
}
export async function assignRole(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    if (!workspace.businessPermissions.has("roles.manage"))
      throw new InputError("Role management permission is required.");
    const branches = form.getAll("branch_ids").map(uuid);
    const overrides: Record<string, string> = {};
    for (const branch of branches) {
      if (!workspace.branches.some((b) => b.id === branch))
        throw new InputError("Unauthorized branch.");
      const value = form.get(`branch_role_${branch}`);
      if (value) overrides[branch] = uuid(value);
    }
    const active = text(form, "is_active");
    if (!["true", "false"].includes(active))
      throw new InputError("Choose membership status.");
    const result = await workspace.supabase.rpc("assign_member_role", {
      p_tenant: workspace.tenant.id,
      p_user: uuid(form.get("user_id")),
      p_role: uuid(form.get("role_id")),
      p_branches: branches,
      p_branch_roles: overrides,
      p_active: active === "true",
    });
    if (result.error)
      return {
        error:
          "Assignment rejected. Owner access is protected. Check delegation limits, employment status, role scopes, and required branch assignments.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Membership and branch roles saved." };
}
export async function inviteEmployee(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    if (workspace.tenant.owner_id !== workspace.user.id)
      throw new InputError("Only the business Owner can invite employees.");
    const id = uuid(form.get("employee_id"));
    await employee(workspace, id, "employees.view");
    const result = await workspace.supabase.rpc("create_employee_invitation", {
      p_tenant: workspace.tenant.id,
      p_employee: id,
      p_role: uuid(form.get("role_id")),
    });
    if (result.error)
      return {
        error:
          "Invitation could not be created. The employee must be active, unlinked, have an email, and have branches for branch-scoped roles.",
      };
    return {
      success:
        "Invitation created. A previous outstanding link has been revoked. No new Auth account was created.",
      link: `${localAppOrigin(process.env.NEXT_PUBLIC_APP_URL)}/invite/${result.data}`,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function revokeInvitation(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    if (workspace.tenant.owner_id !== workspace.user.id)
      throw new InputError("Only the Owner can revoke invitations.");
    const result = await workspace.supabase.rpc("revoke_employee_invitation", {
      p_tenant: workspace.tenant.id,
      p_employee: uuid(form.get("employee_id")),
    });
    if (result.error) return { error: "Invitation could not be revoked." };
    return {
      success:
        "All outstanding invitation links for this employee have been revoked.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function acceptInvitation(): Promise<ActionState> {
  const { supabase } = await requireUser();
  const store = await cookies();
  const token = store.get("forma-invitation")?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token))
    return { error: "Open a fresh invitation link first." };
  const result = await supabase.rpc("accept_employee_invitation", {
    p_token: token,
  });
  if (result.error)
    return {
      error:
        "Invitation unavailable. Use the matching confirmed account, or ask the Owner for a fresh invitation.",
    };
  store.delete("forma-invitation");
  await saveSelection(result.data, null);
  revalidatePath("/", "layout");
  redirect("/businesses");
}
export async function dismissInvitation(): Promise<ActionState> {
  await requireUser();
  (await cookies()).delete("forma-invitation");
  redirect("/businesses");
}
