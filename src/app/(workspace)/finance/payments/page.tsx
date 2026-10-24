import Link from "next/link";
import {
  paymentDirectory,
  hasFinance,
} from "@/features/finance/operations-queries";
import { PaymentTable } from "@/components/finance/payment-table";
import { FinancePagination } from "@/components/finance/pagination";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Manual payments" };
export default async function Payments({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const { workspace, rows, total, page, filters } = await paymentDirectory(
    await searchParams,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Manual payments</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Real received funds, allocations and customer credit · UZS
          </p>
        </div>
        {workspace.branches.some(
          (b) => b.is_active && hasFinance(workspace, "payments.create", b.id),
        ) && (
          <Button asChild>
            <Link href="/finance/payments/new">Record payment</Link>
          </Button>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Customer or external reference"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
        />
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={filters.branch ?? ""}
        >
          <option value="">All authorized branches</option>
          {workspace.branches
            .filter((b) => hasFinance(workspace, "payments.view", b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Method"
          name="method"
          defaultValue={filters.method ?? ""}
        >
          <option value="">All methods</option>
          {["cash", "bank_transfer", "card_terminal", "other"].map((m) => (
            <option key={m} value={m}>
              {m.replaceAll("_", " ")}
            </option>
          ))}
        </SelectField>
        <Field
          label="From date"
          name="from"
          type="date"
          defaultValue={filters.from}
        />
        <Field
          label="To date (inclusive)"
          name="to"
          type="date"
          defaultValue={filters.to}
        />
        {filters.customer && (
          <input type="hidden" name="customer" value={filters.customer} />
        )}
        <Button type="submit">Apply filters</Button>
      </form>
      {workspace.permissions.has("payments.view") ? (
        <>
          <PaymentTable rows={rows} zone={workspace.tenant.timezone} />
          <FinancePagination
            path="/finance/payments"
            filters={filters}
            page={page}
            total={total}
          />
        </>
      ) : (
        <p role="alert">Your role has no payment access.</p>
      )}
    </div>
  );
}
