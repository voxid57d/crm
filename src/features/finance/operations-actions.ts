"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { uuid, text, InputError } from "@/lib/validation.mjs";
import { zonedTimeToIso } from "@/lib/time.mjs";
import type { ActionState } from "@/features/shared/action-state";
import { getPayment } from "./operations-queries";
function fail(e: unknown): ActionState {
  unstable_rethrow(e);
  return {
    error:
      e instanceof InputError
        ? e.message
        : "Financial operation rejected. Check the current balance, permissions, active records and request details.",
  };
}
async function context(form: FormData) {
  const w = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== w.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  if (form.get("confirm_finance") !== "on")
    throw new InputError("Review and confirm the financial operation.");
  return w;
}
function refresh() {
  revalidatePath("/finance", "layout");
  revalidatePath("/customers", "layout");
}
export async function postPayment(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form),
      branch = uuid(form.get("branch_id"));
    assertPermission(w, "payments.view", branch);
    assertPermission(w, "payments.create", branch);
    const invoices = form.getAll("allocation_invoice"),
      amounts = form.getAll("allocation_amount");
    if (invoices.length !== amounts.length || invoices.length > 100)
      throw new InputError("Check invoice allocation lines.");
    const allocations = invoices.flatMap((invoice, index) => {
      if (invoice === "") return [];
      if (typeof amounts[index] !== "string")
        throw new InputError("Enter a decimal allocation amount.");
      return [{ invoice_id: uuid(invoice), amount: amounts[index] as string }];
    });
    const r = await w.supabase.rpc("post_payment", {
      p_tenant: w.tenant.id,
      p_request: uuid(form.get("request_id")),
      p_data: {
        branch_id: branch,
        customer_id: uuid(form.get("customer_id")),
        cashbox_id: uuid(form.get("cashbox_id")),
        amount: text(form, "amount", { min: 1, max: 19 }),
        paid_at: zonedTimeToIso(text(form, "occurred_at"), w.tenant.timezone),
        method: text(form, "method"),
        external_reference: text(form, "external_reference", { max: 150 }),
        notes: text(form, "notes", { max: 2000 }),
      },
      p_allocations: allocations,
    });
    if (r.error)
      return {
        error:
          "Payment rejected. Check the active branch/customer/cashbox, positive exact amount and available invoice balances. A reused request must contain the original details.",
      };
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/payments/${id}?saved=1`);
}
export async function allocatePayment(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form);
    id = uuid(form.get("payment_id"));
    const { detail } = await getPayment(id);
    assertPermission(w, "payments.allocate", detail.payment.branch_id);
    const original = text(form, "original");
    const r = await w.supabase.rpc("allocate_payment", {
      p_tenant: w.tenant.id,
      p_payment: id,
      p_invoice: uuid(form.get("invoice_id")),
      p_request: uuid(form.get("request_id")),
      p_amount: text(form, "amount", { min: 1, max: 19 }),
      p_reason: text(form, "reason", { min: original ? 3 : 0, max: 1000 }),
      ...(original ? { p_original: uuid(original) } : {}),
    });
    if (r.error)
      return {
        error:
          "Allocation rejected. Check available credit, invoice balance and permissions in both branches. Releases require an available original allocation and reason.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/payments/${id}?allocated=1`);
}
