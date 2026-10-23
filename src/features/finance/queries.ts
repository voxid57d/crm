import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import type { CashboxDetail, CashboxRow, FinanceSearch } from "./types";

export function value(search: FinanceSearch, key: string) {
  return typeof search[key] === "string" ? search[key] : "";
}
export function pageNumber(search: FinanceSearch, key = "page") {
  const n = Number(value(search, key));
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 0;
}
export function financeFilters(search: FinanceSearch, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => [key, value(search, key)]).filter(([, v]) => v),
  );
}
export const getCashbox = cache(
  async (id: string, filterKey = "{}", page = 0, auditPage = 0) => {
    try {
      uuid(id);
    } catch {
      notFound();
    }
    const workspace = await getWorkspace();
    const result = await workspace.supabase.rpc("cashbox_details", {
      p_tenant: workspace.tenant.id,
      p_cashbox: id,
      p_filters: JSON.parse(filterKey),
      p_page: page,
      p_audit_page: auditPage,
    });
    if (result.error?.code === "42501") notFound();
    if (result.error)
      throw new Error(
        "Cashbox could not load. Check filters, permissions and local services.",
      );
    return { workspace, detail: result.data as unknown as CashboxDetail };
  },
);
export async function cashboxDirectory(search: FinanceSearch) {
  const workspace = await getWorkspace();
  const page = pageNumber(search);
  const filters = financeFilters(search, [
    "q",
    "branch",
    "status",
    "type",
    "sort",
  ]);
  // Default to the selected branch; an explicit empty scope means all permitted boxes.
  if (
    !Object.hasOwn(search, "branch") &&
    workspace.branch &&
    canCashbox(workspace, "cashboxes.view", workspace.branch.id)
  )
    filters.branch = workspace.branch.id;
  const result = await workspace.supabase.rpc("cashbox_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  if (result.error)
    throw new Error(
      "Cashboxes could not load. Check filters, permissions and local services.",
    );
  return {
    workspace,
    page,
    filters,
    ...(result.data as unknown as { rows: CashboxRow[]; total: number }),
  };
}
export function canCashbox(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  permission: string,
  branch: string | null,
) {
  return branch
    ? Boolean(
        workspace.branchPermissions.get(branch)?.has("cashboxes.view") &&
        workspace.branchPermissions.get(branch)?.has(permission),
      )
    : workspace.businessPermissions.has("cashboxes.view") &&
        workspace.businessPermissions.has(permission);
}
export function financeDate(at: string, zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(at));
}
