import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InvoiceTable } from "@/components/finance/invoice-table";
import { InvoiceFilters } from "@/components/finance/invoice-filters";
import { FinancePagination } from "@/components/finance/pagination";
import {
  invoiceDirectory,
  canInvoice,
} from "@/features/finance/invoice-queries";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Invoices" };
export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const { workspace, data, page, filters } = await invoiceDirectory(
    await searchParams,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workspace.tenant.name} · UZS · Invoicing does not move cash.
          </p>
        </div>
        {workspace.branches.some(
          (b) => b.is_active && canInvoice(workspace, "invoices.create", b.id),
        ) && (
          <Button asChild>
            <Link href="/finance/invoices/new">Create invoice</Link>
          </Button>
        )}
      </div>
      <InvoiceFilters workspace={workspace} filters={filters} />
      {workspace.permissions.has("invoices.view") ? (
        <>
          <InvoiceTable rows={data.rows} />
          <FinancePagination
            path="/finance/invoices"
            filters={filters}
            page={page}
            total={data.total}
          />
        </>
      ) : (
        <p role="alert">Your role has no invoice access.</p>
      )}
    </div>
  );
}
