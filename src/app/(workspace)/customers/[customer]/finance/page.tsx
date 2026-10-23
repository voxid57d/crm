import Link from "next/link";
import { getCustomer } from "@/features/customers/queries";
import {
  customerFinance,
  canInvoice,
} from "@/features/finance/invoice-queries";
import { pageNumber, value } from "@/features/finance/queries";
import type { FinanceSearch } from "@/features/finance/types";
import { DebtSummary } from "@/components/finance/debt-summary";
import { InvoiceTable } from "@/components/finance/invoice-table";
import { FinancePagination } from "@/components/finance/pagination";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/forms/field";
export const metadata = { title: "Customer finances" };
export default async function CustomerFinances({
  params,
  searchParams,
}: {
  params: Promise<{ customer: string }>;
  searchParams: Promise<FinanceSearch>;
}) {
  const { customer: id } = await params;
  const { customer, workspace, branchIds } = await getCustomer(id);
  const search = await searchParams,
    page = pageNumber(search),
    branch = value(search, "branch");
  const data = await customerFinance(id, branch || undefined, page);
  const createBranch = branchIds.find(
    (b) =>
      canInvoice(workspace, "invoices.create", b) &&
      workspace.branches.some((row) => row.id === b && row.is_active),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-primary underline"
            href={`/customers/${id}`}
          >
            Customer profile
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Customer finances
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {customer.first_name} {customer.last_name} · UZS
          </p>
        </div>
        {!customer.archived_at && createBranch && (
          <Button asChild>
            <Link
              href={`/finance/invoices/new?${new URLSearchParams({ customer: id, branch: createBranch })}`}
            >
              Create invoice for customer
            </Link>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Only invoices in branches where you can view invoices and receivables
        are included. Each invoice is counted once. Archived contacts retain
        financial history. Payments, allocations and credit are not implemented
        in this increment.
      </p>
      <form className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-5">
        <SelectField label="Invoice branch" name="branch" defaultValue={branch}>
          <option value="">All authorized invoice branches</option>
          {workspace.branches
            .filter((b) => canInvoice(workspace, "debts.view", b.id))
            .map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
        <Button type="submit">Filter finances</Button>
      </form>
      <DebtSummary summary={data.summary} charges />
      <p className="text-sm text-muted-foreground">
        {data.summary.outstanding_invoices} outstanding invoices · Earliest
        unpaid due date: {data.summary.next_due_date ?? "None"}
      </p>
      <InvoiceTable rows={data.rows} />
      <FinancePagination
        path={`/customers/${id}/finance`}
        filters={branch ? { branch } : {}}
        page={page}
        total={data.total}
      />
    </div>
  );
}
