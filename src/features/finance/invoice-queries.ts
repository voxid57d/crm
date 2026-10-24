import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { financeFilters, pageNumber } from "./queries";
import type { FinanceSearch } from "./types";
import type { PaymentRow } from "./operations-types";
import type {
  InvoiceDetail,
  InvoiceRow,
  DebtRow,
  DebtSummary,
} from "./invoice-types";

export function canInvoice(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  permission: string,
  branch: string,
) {
  const grants = workspace.branchPermissions.get(branch);
  return Boolean(grants?.has("invoices.view") && grants?.has(permission));
}
export function businessDate(zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const getInvoice = cache(async (id: string, auditPage = 0) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const workspace = await getWorkspace();
  const r = await workspace.supabase.rpc("invoice_details", {
    p_tenant: workspace.tenant.id,
    p_invoice: id,
    p_audit_page: auditPage,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error)
    throw new Error("Invoice could not load. Check local services and access.");
  return { workspace, detail: r.data as unknown as InvoiceDetail };
});
type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
type Directory<T> = {
  workspace: Workspace;
  page: number;
  filters: Record<string, string>;
  data: T;
};
export function invoiceDirectory(
  search: FinanceSearch,
  debts?: false,
): Promise<Directory<{ rows: InvoiceRow[]; total: number }>>;
export function invoiceDirectory(
  search: FinanceSearch,
  debts: true,
): Promise<Directory<{ rows: DebtRow[]; summary: DebtSummary; total: number }>>;
export async function invoiceDirectory(search: FinanceSearch, debts = false) {
  const workspace = await getWorkspace(),
    page = pageNumber(search);
  const filters = financeFilters(search, [
    "q",
    "branch",
    "customer",
    ...(debts ? [] : ["status", "sort"]),
  ]);
  if (
    !Object.hasOwn(search, "branch") &&
    workspace.branch &&
    canInvoice(
      workspace,
      debts ? "debts.view" : "invoices.view",
      workspace.branch.id,
    )
  )
    filters.branch = workspace.branch.id;
  if (debts) {
    const r = await workspace.supabase.rpc("debt_directory", {
      p_tenant: workspace.tenant.id,
      p_filters: filters,
      p_page: page,
    });
    if (r.error)
      throw new Error("Receivables could not load. Check filters and access.");
    return {
      workspace,
      page,
      filters,
      data: r.data as unknown as {
        rows: DebtRow[];
        summary: DebtSummary;
        total: number;
      },
    };
  }
  const r = await workspace.supabase.rpc("invoice_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  if (r.error)
    throw new Error("Invoices could not load. Check filters and access.");
  return {
    workspace,
    page,
    filters,
    data: r.data as unknown as { rows: InvoiceRow[]; total: number },
  };
}
export async function customerFinance(
  customerId: string,
  branch?: string,
  page = 0,
) {
  const workspace = await getWorkspace();
  uuid(customerId);
  if (branch) uuid(branch);
  const r = await workspace.supabase.rpc("customer_financial_profile", {
    p_tenant: workspace.tenant.id,
    p_customer: customerId,
    ...(branch ? { p_branch: branch } : {}),
    p_page: page,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Customer financial profile could not load.");
  return {
    workspace,
    ...(r.data as unknown as {
      summary: DebtSummary;
      total: number;
      rows: InvoiceRow[];
      can_view_payments: boolean;
      payments: { rows: PaymentRow[]; total: number };
      payment_summary: { received: string; allocated: string; credit: string };
    }),
  };
}
export function canCustomerDebt(w: Workspace) {
  return (
    (w.businessPermissions.has("invoices.view") &&
      w.businessPermissions.has("debts.view")) ||
    w.branches.some(
      (b) =>
        w.branchPermissions.get(b.id)?.has("invoices.view") &&
        w.branchPermissions.get(b.id)?.has("debts.view"),
    )
  );
}
export function canCustomerFinance(w: Workspace) {
  return canCustomerDebt(w) || w.permissions.has("payments.view");
}
export async function customerPaymentProfile(
  customerId: string,
  branch?: string,
  page = 0,
) {
  const w = await getWorkspace();
  uuid(customerId);
  if (branch) uuid(branch);
  const r = await w.supabase.rpc("customer_payment_profile", {
    p_tenant: w.tenant.id,
    p_customer: customerId,
    ...(branch ? { p_branch: branch } : {}),
    p_page: page,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Payment overview could not load.");
  return r.data as unknown as {
    can_view_payments: boolean;
    payment_summary: { received: string; allocated: string; credit: string };
    payments: { rows: PaymentRow[]; total: number };
  };
}
