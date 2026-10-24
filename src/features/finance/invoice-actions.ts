"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { getInvoice } from "./invoice-queries";
import { InputError, text, uuid } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";

function fail(e: unknown): ActionState {
  unstable_rethrow(e);
  return {
    error:
      e instanceof InputError
        ? e.message
        : "Invoice change could not be saved. Check current access and local services.",
  };
}
async function context(form: FormData) {
  const workspace = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== workspace.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  return workspace;
}
function version(form: FormData) {
  const v = text(form, "version");
  if (!/^[0-9]{1,9}$/.test(v))
    throw new InputError("Invalid document version. Reload before saving.");
  return Number(v);
}
function refresh() {
  revalidatePath("/finance", "layout");
  revalidatePath("/customers", "layout");
}
export async function saveInvoiceDraft(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const workspace = await context(form),
      oldId = form.get("invoice_id") ? uuid(form.get("invoice_id")) : null,
      branch = uuid(form.get("branch_id"));
    assertPermission(workspace, "invoices.view", branch);
    assertPermission(workspace, "invoices.create", branch);
    if (oldId) {
      const old = await getInvoice(oldId);
      assertPermission(
        workspace,
        "invoices.create",
        old.detail.invoice.branch_id,
      );
    }
    const descriptions = form.getAll("line_description"),
      quantities = form.getAll("line_quantity"),
      prices = form.getAll("line_price"),
      discounts = form.getAll("line_discount");
    if (
      descriptions.length < 1 ||
      descriptions.length > 100 ||
      [quantities, prices, discounts].some(
        (v) => v.length !== descriptions.length,
      )
    )
      throw new InputError("Add between 1 and 100 complete invoice lines.");
    const lineText = (v: FormDataEntryValue, max: number) => {
      if (typeof v !== "string" || v.trim().length < 1 || v.length > max)
        throw new InputError(
          "Complete each invoice line using decimal amounts.",
        );
      return v.trim();
    };
    const items = descriptions.map((v, i) => ({
      description: lineText(v, 500),
      quantity: lineText(quantities[i], 11),
      unit_price: lineText(prices[i], 19),
      discount_amount: lineText(discounts[i], 19),
    }));
    const replacement = text(form, "replaces_invoice_id");
    const r = await workspace.supabase.rpc("save_invoice_draft", {
      p_tenant: workspace.tenant.id,
      p_invoice: oldId,
      p_request: uuid(form.get("request_id")),
      p_version: version(form),
      p_data: {
        branch_id: branch,
        customer_id: uuid(form.get("customer_id")),
        currency: "UZS",
        issue_date: text(form, "issue_date"),
        due_date: text(form, "due_date"),
        discount_amount: text(form, "invoice_discount", {
          min: 1,
          max: 19,
          label: "Invoice discount",
        }),
        notes: text(form, "notes", { max: 2000 }),
        replaces_invoice_id: replacement ? uuid(replacement) : null,
      },
      p_items: items,
    });
    if (r.error)
      return {
        error:
          r.error.code === "40001"
            ? "Invoice changed. Reload before saving."
            : "Draft rejected. Check customer/branch access, dates, quantities, precision and discounts. Only drafts can be edited.",
      };
    id = r.data;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/invoices/${id}?saved=1`);
}
export async function transitionInvoice(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const workspace = await context(form);
    id = uuid(form.get("invoice_id"));
    const { detail } = await getInvoice(id);
    const action = text(form, "invoice_action");
    if (!["issue", "void", "discard"].includes(action))
      throw new InputError("Unsupported invoice action.");
    const permission =
      action === "issue"
        ? "invoices.issue"
        : action === "void"
          ? "invoices.void"
          : "invoices.create";
    assertPermission(workspace, "invoices.view", detail.invoice.branch_id);
    assertPermission(workspace, permission, detail.invoice.branch_id);
    if (form.get("confirm_invoice") !== "on")
      throw new InputError("Confirm the invoice action before continuing.");
    const r = await workspace.supabase.rpc("transition_invoice", {
      p_tenant: workspace.tenant.id,
      p_invoice: id,
      p_request: uuid(form.get("request_id")),
      p_version: version(form),
      p_action: action,
      p_reason: text(form, "reason", {
        min: action === "issue" ? 0 : 3,
        max: 1000,
        label: "Reason",
      }),
    });
    if (r.error)
      return {
        error:
          r.error.code === "40001"
            ? "Invoice changed. Reload before continuing."
            : "Invoice action rejected. Check state, active customer/branch, date, positive total and permissions. Release active allocations before voiding.",
      };
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect(`/finance/invoices/${id}?updated=1`);
}
