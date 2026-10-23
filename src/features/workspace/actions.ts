"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { getWorkspace, assertPermission } from "./context";
import { saveSelection } from "./selection";
import { text, email, uuid, InputError } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
import type { AppRole } from "@/lib/supabase/schema";

function failure(error: unknown): ActionState {
  return {
    error:
      error instanceof InputError
        ? error.message
        : "The change could not be saved. Check local services and try again.",
  };
}

function assertBusiness(form: FormData, tenantId: string) {
  if (uuid(form.get("tenant_id")) !== tenantId)
    throw new InputError("Business selection changed. Reload before saving.");
}

async function selectAuthorizedBusiness(tenantId: string) {
  const { supabase } = await requireUser();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .single();
  if (error || !tenant)
    throw new InputError("You do not have access to this business.");
  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  if (branchError) throw new Error("Branch query failed");
  await saveSelection(tenantId, branches[0]?.id ?? null);
}

export async function selectBusiness(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();
  try {
    await selectAuthorizedBusiness(uuid(form.get("tenant_id")));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function selectBranch(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const workspace = await getWorkspace();
  try {
    assertBusiness(form, workspace.tenant.id);
    const branchId = uuid(form.get("branch_id"));
    if (
      !workspace.branches.some(
        (branch) => branch.id === branchId && branch.is_active,
      )
    )
      throw new InputError(
        "Select an active branch you are authorized to access.",
      );
    await saveSelection(workspace.tenant.id, branchId);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createBusiness(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const values = {
      p_name: text(form, "name", { min: 1, max: 150, label: "Business name" }),
      p_business_type: text(form, "business_type", {
        min: 1,
        max: 80,
        label: "Business type",
      }),
      p_contact_email: email(form, "contact_email", true),
      p_phone: text(form, "phone", { max: 40, label: "Phone" }),
      p_address: text(form, "address", { max: 500, label: "Address" }),
      p_branch_name: text(form, "branch_name", {
        min: 1,
        max: 150,
        label: "First branch name",
      }),
    };
    const { data: tenantId, error } = await supabase.rpc(
      "create_business",
      values,
    );
    if (error || !tenantId)
      return {
        error:
          "Business creation failed. Check the input and apply the latest local migrations.",
      };
    await selectAuthorizedBusiness(tenantId);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function saveBranch(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const workspace = await getWorkspace();
  try {
    assertBusiness(form, workspace.tenant.id);
    const rawId = form.get("branch_id");
    const branchId = rawId ? uuid(rawId) : undefined;
    assertPermission(
      workspace,
      branchId ? "branches.update" : "branches.create",
      branchId,
    );
    const active = form.get("is_active");
    if (active !== "true" && active !== "false")
      throw new InputError("Choose an active status.");
    const values = {
      name: text(form, "name", { min: 1, max: 150, label: "Branch name" }),
      address: text(form, "address", { max: 500, label: "Address" }),
      phone: text(form, "phone", { max: 40, label: "Phone" }),
      is_active: active === "true",
    };
    const result = branchId
      ? await workspace.supabase
          .from("branches")
          .update(values)
          .eq("tenant_id", workspace.tenant.id)
          .eq("id", branchId)
          .select("id")
          .single()
      : await workspace.supabase
          .from("branches")
          .insert({ ...values, tenant_id: workspace.tenant.id })
          .select("id")
          .single();
    if (result.error)
      return {
        error:
          result.error.code === "23505"
            ? "A branch with this name already exists in this business."
            : "Branch could not be saved. Verify your access and local migrations.",
      };
    if (branchId === workspace.branch?.id && !values.is_active)
      await saveSelection(workspace.tenant.id, null);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Branch saved." };
}

export async function saveBusinessSettings(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const workspace = await getWorkspace();
  try {
    assertBusiness(form, workspace.tenant.id);
    assertPermission(workspace, "tenant.update");
    const currency = text(form, "currency", {
      min: 3,
      max: 3,
      label: "Currency",
    }).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new InputError("Use a three-letter currency code, such as UZS.");
    const timezone = text(form, "timezone", {
      min: 1,
      max: 100,
      label: "Timezone",
    });
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      throw new InputError(
        "Enter a valid IANA timezone, such as Asia/Tashkent.",
      );
    }
    const { error } = await workspace.supabase
      .from("tenants")
      .update({
        name: text(form, "name", { min: 1, max: 150, label: "Business name" }),
        business_type: text(form, "business_type", {
          min: 1,
          max: 80,
          label: "Business type",
        }),
        contact_email: email(form, "contact_email", true),
        phone: text(form, "phone", { max: 40, label: "Phone" }),
        address: text(form, "address", { max: 500, label: "Address" }),
        currency,
        timezone,
      })
      .eq("id", workspace.tenant.id)
      .select("id")
      .single();
    if (error)
      return {
        error:
          "Business settings could not be saved. Verify your access and timezone.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Business settings saved." };
}

export async function saveProfile(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, supabase } = await requireUser();
  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: text(form, "full_name", {
          min: 1,
          max: 150,
          label: "Full name",
        }),
        phone: text(form, "phone", { max: 40, label: "Phone" }),
      })
      .eq("id", user.id)
      .select("id")
      .single();
    if (error)
      return {
        error: "Your profile could not be saved. Check local migrations.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/settings");
  return { success: "Profile saved." };
}

export async function saveMember(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const workspace = await getWorkspace();
  try {
    assertBusiness(form, workspace.tenant.id);
    assertPermission(workspace, "members.manage");
    const role = text(form, "role");
    if (!["admin", "manager", "employee"].includes(role))
      throw new InputError("Choose Admin, Branch Manager, or Employee.");
    const branches = form.getAll("branch_ids").map(uuid);
    if (
      branches.some(
        (id) => !workspace.branches.some((branch) => branch.id === id),
      )
    )
      throw new InputError("A branch is outside this business.");
    const active = form.get("is_active");
    if (active !== "true" && active !== "false")
      throw new InputError("Choose an active membership status.");
    if (active === "true" && role !== "admin" && branches.length === 0)
      throw new InputError("Assign at least one branch.");
    const address = email(form);
    const existing = await workspace.supabase.rpc("list_business_members", {
      p_tenant: workspace.tenant.id,
    });
    if (existing.error)
      throw new InputError("Existing membership could not be checked.");
    if (
      existing.data.some(
        (member) => member.email.toLowerCase() === address.toLowerCase(),
      )
    )
      throw new InputError(
        "This account is already a member. Use Roles & permissions to preserve its custom and branch-specific roles.",
      );
    const { error } = await workspace.supabase.rpc("set_business_member", {
      p_tenant: workspace.tenant.id,
      p_email: address,
      p_role: role as AppRole,
      p_branches: branches,
      p_active: active === "true",
    });
    if (error)
      return {
        error:
          error.code === "22023"
            ? "The account must register first, and active branch roles need a branch assignment."
            : "Membership could not be saved. Only the Owner can manage other members; the Owner cannot be reassigned.",
      };
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "Membership and branch assignments saved." };
}
