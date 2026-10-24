import "server-only";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { financeFilters, pageNumber, value } from "./queries";
import type { FinanceSearch } from "./types";
import {
  financeReports,
  type FinancialReportKind,
  type ReportData,
  type ReportOptions,
} from "./reports-config";
export async function reportContext(search: FinanceSearch) {
  const workspace = await getWorkspace();
  if (!workspace.permissions.has("finance.reports.view")) notFound();
  const kind = value(search, "report") || "payments";
  if (!Object.hasOwn(financeReports, kind)) notFound();
  return {
    workspace,
    kind: kind as FinancialReportKind,
    filters: financeFilters(search, [
      "from",
      "to",
      "branch",
      "customer",
      "cashbox",
      "method",
      "actor",
      "category",
      "kind",
      "q",
    ]),
    page: pageNumber(search),
  };
}
export async function getReport(search: FinanceSearch) {
  const context = await reportContext(search),
    { workspace: w, kind, filters, page } = context;
  if (kind === "customer_statement" && !filters.customer)
    return { ...context, data: { rows: [], total: 0 } satisfies ReportData };
  const r = await w.supabase.rpc("financial_report", {
    p_tenant: w.tenant.id,
    p_report: kind,
    p_filters: filters,
    p_page: page,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error)
    throw new Error("Report could not load. Check date range and filters.");
  return { ...context, data: r.data as unknown as ReportData };
}
export async function reportOptions(filters: Record<string, string>) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("financial_report_options", {
      p_tenant: w.tenant.id,
      p_filters: filters,
    });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Report filters could not load.");
  return r.data as unknown as ReportOptions;
}
