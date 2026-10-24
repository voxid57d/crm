import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { financeFilters, pageNumber } from "./queries";
import type { FinanceSearch } from "./types";
import type {
  PaymentDetail,
  PaymentRow,
  OperationKind,
  OperationRow,
  TransactionReview,
  OperationOptions,
} from "./operations-types";
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
export async function operationDirectory(
  kind: OperationKind,
  search: FinanceSearch,
) {
  const workspace = await getWorkspace(),
    page = pageNumber(search),
    filters = financeFilters(search, [
      "q",
      "branch",
      "customer",
      "cashbox",
      "actor",
      "category",
      "from",
      "to",
    ]);
  const r = await workspace.supabase.rpc("financial_operation_directory", {
    p_tenant: workspace.tenant.id,
    p_kind: kind,
    p_filters: filters,
    p_page: page,
  });
  if (r.error)
    throw new Error(
      "Financial history could not load. Check filters and access.",
    );
  return {
    workspace,
    page,
    filters,
    ...(r.data as unknown as { rows: OperationRow[]; total: number }),
  };
}
export const getOperation = cache(async (kind: OperationKind, id: string) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const workspace = await getWorkspace();
  const r = await workspace.supabase.rpc("financial_operation_details", {
    p_tenant: workspace.tenant.id,
    p_kind: kind,
    p_id: id,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Financial operation could not load.");
  return { workspace, detail: r.data as unknown as OperationRow };
});
export const getTransaction = cache(async (id: string) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const workspace = await getWorkspace();
  const r = await workspace.supabase.rpc("financial_transaction_details", {
    p_tenant: workspace.tenant.id,
    p_transaction: id,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Transaction could not load.");
  return { workspace, detail: r.data as unknown as TransactionReview };
});
export async function operationOptions(kind: OperationKind, branch?: string) {
  const w = await getWorkspace();
  const r = await w.supabase.rpc("finance_operation_options", {
    p_tenant: w.tenant.id,
    p_kind: kind,
    ...(branch ? { p_branch: uuid(branch) } : {}),
  });
  if (r.error) notFound();
  return r.data as unknown as OperationOptions;
}
