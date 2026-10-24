"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { uuid, text, InputError } from "@/lib/validation.mjs";
import { zonedTimeToIso } from "@/lib/time.mjs";
import type { ActionState } from "@/features/shared/action-state";
import { getPayment } from "./operations-queries";
import { getTransaction, getOperation } from "./operations-queries";
import { canCashbox } from "./queries";
import { randomUUID } from "node:crypto";
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
export async function postExpense(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form),
      branch = uuid(form.get("branch_id"));
    assertPermission(w, "expenses.view", branch);
    assertPermission(w, "expenses.create", branch);
    const r = await w.supabase.rpc("post_expense", {
      p_tenant: w.tenant.id,
      p_request: uuid(form.get("request_id")),
      p_data: {
        branch_id: branch,
        cashbox_id: uuid(form.get("cashbox_id")),
        category_id: uuid(form.get("category_id")),
        amount: text(form, "amount", { min: 1, max: 19 }),
        occurred_at: zonedTimeToIso(
          text(form, "occurred_at"),
          w.tenant.timezone,
        ),
        description: text(form, "reason", { min: 3, max: 1000 }),
        vendor: text(form, "vendor", { max: 150 }),
      },
    });
    if (r.error)
      return {
        error:
          "Expense rejected. Check permissions, category, active cashbox, date and available balance.",
      };
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/expenses/${id}?saved=1`);
}
export async function postTransfer(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form),
      source = uuid(form.get("source_id")),
      destination = uuid(form.get("destination_id"));
    const boxes = await w.supabase
      .from("cashboxes")
      .select("id,branch_id")
      .in("id", [source, destination])
      .eq("tenant_id", w.tenant.id);
    if (
      boxes.error ||
      boxes.data.length !== 2 ||
      boxes.data.some((b) => !canCashbox(w, "cashboxes.transfer", b.branch_id))
    )
      throw new InputError("Choose two cashboxes you can transfer between.");
    const r = await w.supabase.rpc("post_cashbox_transfer", {
      p_tenant: w.tenant.id,
      p_request: uuid(form.get("request_id")),
      p_source: source,
      p_destination: destination,
      p_amount: text(form, "amount", { min: 1, max: 19 }),
      p_at: zonedTimeToIso(text(form, "occurred_at"), w.tenant.timezone),
      p_reason: text(form, "reason", { min: 3, max: 1000 }),
    });
    if (r.error)
      return {
        error:
          "Transfer rejected. Check both cashboxes, balance, date and permissions.",
      };
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/transfers/${id}?saved=1`);
}
export async function refundPayment(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form);
    id = uuid(form.get("payment_id"));
    const { detail } = await getPayment(id);
    assertPermission(w, "payments.refund", detail.payment.branch_id);
    const r = await w.supabase.rpc("post_payment_refund", {
      p_tenant: w.tenant.id,
      p_payment: id,
      p_request: uuid(form.get("request_id")),
      p_cashbox: uuid(form.get("cashbox_id")),
      p_amount: text(form, "amount", { min: 1, max: 19 }),
      p_at: zonedTimeToIso(text(form, "occurred_at"), w.tenant.timezone),
      p_reason: text(form, "reason", { min: 3, max: 1000 }),
    });
    if (r.error)
      return {
        error:
          "Refund rejected. Check remaining refundable amount, cash balance and permissions for all invoices whose allocations must be released.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/payments/${id}?refunded=1`);
}
export async function reverseTransaction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form);
    id = uuid(form.get("transaction_id"));
    const { detail } = await getTransaction(id);
    if (
      detail.cashboxes.some(
        (b) => !canCashbox(w, "finance.reverse", b.branch_id),
      )
    )
      throw new InputError(
        "Reversal permission is required for every cashbox.",
      );
    const r = await w.supabase.rpc("reverse_financial_transaction", {
      p_tenant: w.tenant.id,
      p_transaction: id,
      p_request: uuid(form.get("request_id")),
      p_at: zonedTimeToIso(text(form, "occurred_at"), w.tenant.timezone),
      p_reason: text(form, "reason", { min: 3, max: 1000 }),
    });
    if (r.error)
      return {
        error:
          "Reversal rejected. Check permissions, available balances, original date and whether it has already been reversed.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/transactions/${id}?reversed=1`);
}
export async function saveCategory(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const w = await context(form);
    assertPermission(w, "expenses.manage");
    const id = text(form, "category_id");
    const r = await w.supabase.rpc("save_expense_category", {
      p_tenant: w.tenant.id,
      p_id: id ? uuid(id) : null,
      p_name: text(form, "name", { min: 1, max: 100 }),
      p_active: form.get("is_active") === "true",
      p_version: Number(text(form, "version")),
    });
    if (r.error)
      return {
        error:
          "Category could not save. Check name uniqueness and reload changed records.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect("/finance/expenses/categories?saved=1");
}
export async function setOverdraft(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form);
    id = uuid(form.get("cashbox_id"));
    if (w.tenant.owner_id !== w.user.id)
      throw new InputError("Only the business owner can change this policy.");
    const r = await w.supabase.rpc("set_cashbox_overdraft", {
      p_tenant: w.tenant.id,
      p_cashbox: id,
      p_request: uuid(form.get("request_id")),
      p_allow: form.get("allow_negative") === "true",
      p_version: Number(text(form, "version")),
      p_reason: text(form, "reason", { min: 3, max: 1000 }),
    });
    if (r.error)
      return {
        error:
          "Policy rejected. Reload changed cashboxes; restore nonnegative balance before disabling overdraft.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/cashboxes/${id}?saved=1`);
}
export async function uploadExpenseReceipt(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const w = await context(form);
    id = uuid(form.get("expense_id"));
    const { detail } = await getOperation("expense", id);
    if (!detail.branch_id) throw new InputError("Expense branch missing.");
    assertPermission(w, "expenses.create", detail.branch_id);
    const file = form.get("receipt");
    if (!(file instanceof File) || file.size === 0 || file.size > 5242880)
      throw new InputError("Choose a PDF, PNG, JPEG or WebP file up to 5 MiB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext =
      file.type === "application/pdf" &&
      Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-"
        ? "pdf"
        : file.type === "image/png" &&
            Buffer.from(bytes.slice(0, 8)).equals(
              Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            )
          ? "png"
          : file.type === "image/jpeg" &&
              bytes[0] === 255 &&
              bytes[1] === 216 &&
              bytes[2] === 255
            ? "jpg"
            : file.type === "image/webp" &&
                Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" &&
                Buffer.from(bytes.slice(8, 12)).toString() === "WEBP"
              ? "webp"
              : null;
    if (!ext)
      throw new InputError(
        "File contents must match a supported receipt format.",
      );
    const r = await w.supabase.storage
      .from("finance-receipts")
      .upload(`${w.tenant.id}/expenses/${id}/${randomUUID()}.${ext}`, bytes, {
        contentType: file.type,
        upsert: false,
      });
    if (r.error)
      return {
        error:
          "Receipt upload failed. The expense is already saved; retry attaching the file separately.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/expenses/${id}?uploaded=1`);
}
