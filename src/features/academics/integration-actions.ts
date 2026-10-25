"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { getEnrollment } from "./group-queries";
import { InputError, text, uuid } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
export async function createEnrollmentInvoice(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let result: string;
  try {
    const w = await getWorkspace(),
      enrollment = uuid(form.get("enrollment_id"));
    if (uuid(form.get("tenant_id")) !== w.tenant.id)
      throw new InputError("Business changed. Reload before saving.");
    const { detail: d } = await getEnrollment(enrollment);
    for (const p of [
      "enrollments.view_pricing",
      "invoices.view",
      "invoices.create",
    ])
      assertPermission(w, p, d.enrollment.branch_id);
    if (form.get("confirm_draft") !== "on")
      throw new InputError(
        "Confirm the debtor and charge before creating a draft.",
      );
    const version = text(form, "version");
    if (!/^[1-9][0-9]{0,8}$/.test(version))
      throw new InputError("Invalid enrollment version. Reload before saving.");
    const r = await w.supabase.rpc("create_enrollment_invoice_draft", {
      p_tenant: w.tenant.id,
      p_enrollment: enrollment,
      p_request: uuid(form.get("request_id")),
      p_version: Number(version),
      p_issue_date: text(form, "issue_date"),
      p_due_date: text(form, "due_date"),
      p_description: text(form, "description", {
        min: 1,
        max: 500,
        label: "Charge description",
      }),
    });
    if (r.error)
      return {
        error:
          r.error.code === "40001"
            ? "Enrollment changed. Reload and review the agreement."
            : "Draft rejected. Check finance and student access, active branch, dates and charge details.",
      };
    result = r.data;
  } catch (e) {
    unstable_rethrow(e);
    return {
      error:
        e instanceof InputError
          ? e.message
          : "Draft could not be created. Check access and local services.",
    };
  }
  revalidatePath("/finance", "layout");
  revalidatePath("/students", "layout");
  revalidatePath("/customers", "layout");
  revalidatePath("/enrollments", "layout");
  redirect(`/finance/invoices/${result}?saved=1`);
}
