import Link from "next/link";
import { getCustomer, getStudent } from "@/features/customers/queries";
import {
  customerFinance,
  canInvoice,
  canCustomerDebt,
  customerPaymentProfile,
} from "@/features/finance/invoice-queries";
import { pageNumber, value, financeDate } from "@/features/finance/queries";
import type { FinanceSearch } from "@/features/finance/types";
import { DebtSummary } from "@/components/finance/debt-summary";
import { InvoiceTable } from "@/components/finance/invoice-table";
import { FinancePagination } from "@/components/finance/pagination";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/forms/field";
import { PaymentTable } from "@/components/finance/payment-table";
import { formatMoney } from "@/features/finance/money.mjs";
import type { OperationRow } from "@/features/finance/operations-types";
export async function ContactFinances({
  customerId: id,
  search,
  studentFirst = false,
  embedded = false,
}: {
  customerId: string;
  search: FinanceSearch;
  studentFirst?: boolean;
  embedded?: boolean;
}) {
  const { customer, workspace, branchIds } = studentFirst
    ? await getStudent(id)
    : await getCustomer(id);
  const pageKey = embedded ? "finance_page" : "page",
    page = pageNumber(search, pageKey),
    branch = value(search, "branch"),
    paymentPage = pageNumber(search, "payment_page"),
    refundPage = pageNumber(search, "refund_page");
  const path =
    (studentFirst ? "/students/" : "/customers/") +
    id +
    (embedded ? "" : "/finance");
  const filters = {
    ...(branch ? { branch } : {}),
    [pageKey]: String(page),
    payment_page: String(paymentPage),
    refund_page: String(refundPage),
  };
  const debtData = canCustomerDebt(workspace)
    ? await customerFinance(id, branch || undefined, page)
    : null;
  const data =
    debtData ??
    (await customerPaymentProfile(id, branch || undefined, paymentPage));
  let payments = data.payments;
  let refunds: { rows: OperationRow[]; total: number } = { rows: [], total: 0 };
  if (data.can_view_payments) {
    if (debtData && paymentPage !== page) {
      const r = await workspace.supabase.rpc("payment_directory", {
        p_tenant: workspace.tenant.id,
        p_filters: { customer: id, ...(branch ? { branch } : {}) },
        p_page: paymentPage,
      });
      if (r.error) throw new Error("Payment history could not load.");
      payments = r.data as unknown as typeof payments;
    }
    const r = await workspace.supabase.rpc("financial_operation_directory", {
      p_tenant: workspace.tenant.id,
      p_kind: "refund",
      p_filters: { customer: id, ...(branch ? { branch } : {}) },
      p_page: refundPage,
    });
    if (r.error) throw new Error("Refund history could not load.");
    refunds = r.data as unknown as typeof refunds;
  }
  const createBranch = branchIds.find(
    (b) =>
      canInvoice(workspace, "invoices.create", b) &&
      workspace.branches.some((row) => row.id === b && row.is_active),
  );
  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              className="text-sm text-primary underline"
              href={studentFirst ? `/students/${id}` : `/customers/${id}`}
            >
              {studentFirst ? "Student profile" : "Customer profile"}
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {studentFirst ? "Student finances" : "Customer finances"}
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Financial information</h2>
          {!customer.archived_at && createBranch && (
            <Button asChild variant="outline">
              <Link
                href={`/finance/invoices/new?${new URLSearchParams({ customer: id, branch: createBranch })}`}
              >
                Create invoice
              </Link>
            </Button>
          )}
        </div>
      )}
      {workspace.permissions.has("finance.reports.view") && (
        <Button asChild variant="outline">
          <Link
            href={`/finance/reports?${new URLSearchParams({ report: "customer_statement", customer: id, ...(branch ? { branch } : {}) })}`}
          >
            {studentFirst
              ? "Student financial statement"
              : "Customer financial statement"}
          </Link>
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Only invoices in branches where you can view invoices and receivables
        are included. Each invoice is counted once. Archived contacts retain
        financial history. Payment credit is shown only for payments you can
        access.
      </p>
      <form
        action={embedded ? path + "#finance" : undefined}
        className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-5"
      >
        <SelectField
          label="Financial branch"
          name="branch"
          defaultValue={branch}
        >
          <option value="">All authorized financial branches</option>
          {workspace.branches
            .filter(
              (b) =>
                canInvoice(workspace, "debts.view", b.id) ||
                workspace.branchPermissions.get(b.id)?.has("payments.view"),
            )
            .map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
        <Button type="submit">Filter finances</Button>
      </form>
      {debtData && (
        <>
          <DebtSummary summary={debtData.summary} charges />
          <p className="text-sm text-muted-foreground">
            {debtData.summary.outstanding_invoices} outstanding invoices ·
            Earliest unpaid due date: {debtData.summary.next_due_date ?? "None"}
          </p>
          <InvoiceTable
            rows={debtData.rows}
            identityLabel={studentFirst ? "Student" : "Customer"}
          />
        </>
      )}
      {data.can_view_payments && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Payment history and credit</h2>
          <p className="text-sm">
            Available credit:{" "}
            <strong>{formatMoney(data.payment_summary.credit)}</strong> · Net
            allocated: {formatMoney(data.payment_summary.allocated)}
          </p>
          <PaymentTable
            rows={payments.rows}
            zone={workspace.tenant.timezone}
            identityLabel={studentFirst ? "Student" : "Customer"}
          />
          <FinancePagination
            path={path}
            filters={filters}
            pageKey="payment_page"
            page={paymentPage}
            total={payments.total}
            anchor={embedded ? "#finance" : ""}
          />
          <Link
            className="text-primary underline"
            href={`/finance/payments?${new URLSearchParams({ customer: id, branch: branch || "" })}`}
          >
            All authorized customer payments
          </Link>
          <h3 className="font-semibold">Refund history</h3>
          <div className="space-y-3">
            {refunds.rows.map((r) => (
              <article key={r.id} className="rounded-lg border bg-white p-4">
                <Link
                  className="text-primary underline"
                  href={"/finance/payments/" + r.payment_id}
                >
                  Refund {formatMoney(r.amount)}
                </Link>
                <p className="mt-1 text-sm">{r.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.cashbox_name} | {r.actor_name} |{" "}
                  {financeDate(r.occurred_at, workspace.tenant.timezone)}
                </p>
              </article>
            ))}
            {!refunds.rows.length && (
              <p className="text-sm text-muted-foreground">
                No authorized refunds on this page.
              </p>
            )}
          </div>
          <FinancePagination
            path={path}
            filters={filters}
            pageKey="refund_page"
            page={refundPage}
            total={refunds.total}
            anchor={embedded ? "#finance" : ""}
          />
        </section>
      )}
      {debtData && (
        <FinancePagination
          path={path}
          pageKey={pageKey}
          anchor={embedded ? "#finance" : ""}
          filters={filters}
          page={page}
          total={debtData.total}
        />
      )}
    </div>
  );
}
