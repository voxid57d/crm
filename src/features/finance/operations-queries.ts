import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { financeFilters, pageNumber } from "./queries";
import type { FinanceSearch } from "./types";
import type { PaymentDetail, PaymentRow } from "./operations-types";
export function hasFinance(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  permission: string,
  branch: string,
) {
  return Boolean(workspace.branchPermissions.get(branch)?.has(permission));
}
export const getPayment = cache(async (id: string) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const workspace = await getWorkspace();
  const r = await workspace.supabase.rpc("payment_details", {
    p_tenant: workspace.tenant.id,
    p_payment: id,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Payment could not load.");
  return { workspace, detail: r.data as unknown as PaymentDetail };
});
export async function paymentDirectory(search: FinanceSearch) {
  const workspace = await getWorkspace(),
    page = pageNumber(search),
    filters = financeFilters(search, [
      "q",
      "branch",
      "customer",
      "cashbox",
      "actor",
      "from",
      "to",
      "method",
    ]);
  if (
    !Object.hasOwn(search, "branch") &&
    workspace.branch &&
    hasFinance(workspace, "payments.view", workspace.branch.id)
  )
    filters.branch = workspace.branch.id;
  const r = await workspace.supabase.rpc("payment_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  if (r.error)
    throw new Error("Payments could not load. Check filters and access.");
  return {
    workspace,
    page,
    filters,
    ...(r.data as unknown as { rows: PaymentRow[]; total: number }),
  };
}
