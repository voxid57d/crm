"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { getCashbox } from "./queries";
import { moneyInput } from "./money.mjs";
import { InputError, text, uuid } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";

function fail(error: unknown): ActionState {
  unstable_rethrow(error);
  return {
    error:
      error instanceof InputError
        ? error.message
        : "The financial change could not be saved. Check inputs, current permissions and local services.",
  };
}
async function context(form: FormData) {
  const workspace = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== workspace.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  return workspace;
}
export async function saveCashbox(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const workspace = await context(form),
      oldId = form.get("cashbox_id") ? uuid(form.get("cashbox_id")) : null;
    const branchValue = text(form, "branch_id"),
      branch = branchValue ? uuid(branchValue) : null;
    assertPermission(workspace, "cashboxes.view", branch ?? undefined);
    assertPermission(workspace, "cashboxes.manage", branch ?? undefined);
    if (oldId) {
      const existing = await getCashbox(oldId);
      assertPermission(
        workspace,
        "cashboxes.manage",
        existing.detail.cashbox.branch_id ?? undefined,
      );
    }
    const result = await workspace.supabase.rpc("save_cashbox", {
      p_tenant: workspace.tenant.id,
      p_id: oldId,
      p_request: uuid(form.get("request_id")),
      p_data: {
        branch_id: branch,
        name: text(form, "name", { min: 1, max: 100, label: "Cashbox name" }),
        cashbox_type: text(form, "cashbox_type"),
        currency: "UZS",
        is_active: text(form, "is_active") === "true",
        version: text(form, "version"),
      },
    });
    if (result.error)
      return {
        error:
          result.error.code === "40001"
            ? "This cashbox changed. Reload before saving."
            : "Cashbox could not be saved. Choose an authorized active branch. Branch and currency cannot change after creation.",
      };
    id = result.data;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/finance", "layout");
  redirect(`/finance/cashboxes/${id}?saved=1`);
}
export async function postCashboxEntry(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const workspace = await context(form);
    id = uuid(form.get("cashbox_id"));
    const { detail } = await getCashbox(id);
    const branch = detail.cashbox.branch_id ?? undefined;
    assertPermission(workspace, "cashboxes.view", branch);
    assertPermission(workspace, "cashboxes.adjust", branch);
    if (form.get("confirm_posting") !== "on")
      throw new InputError(
        "Confirm the immutable financial posting before saving.",
      );
    const kind = text(form, "kind");
    if (!["opening_balance", "adjustment"].includes(kind))
      throw new InputError("Unsupported posting type.");
    const amount = moneyInput(
      text(form, "amount", { max: 30, label: "Amount" }),
      kind === "adjustment",
    );
    const result = await workspace.supabase.rpc("post_cashbox_entry", {
      p_tenant: workspace.tenant.id,
      p_cashbox: id,
      p_request: uuid(form.get("request_id")),
      p_kind: kind,
      p_amount: amount,
      p_reason: text(form, "reason", { min: 3, max: 1000, label: "Reason" }),
    });
    if (result.error)
      return {
        error:
          "Posting rejected. Check the active cashbox/branch, available balance and request details. An opening balance is allowed only as the first posting. Reload after changing a previously submitted request.",
      };
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/finance", "layout");
  redirect(`/finance/cashboxes/${id}?posted=1`);
}
