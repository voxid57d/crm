import Link from "next/link";
import { customerFinance } from "@/features/finance/invoice-queries";
import { formatMoney } from "@/features/finance/money.mjs";
export async function CustomerFinanceCard({
  customerId,
}: {
  customerId: string;
}) {
  const { summary } = await customerFinance(customerId);
  return (
    <section id="finance" className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Invoices and receivables</h2>
      <p className="text-xs text-muted-foreground">
        Authorized invoice branches only.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>Outstanding</dt>
        <dd className="text-right font-medium tabular-nums">
          {formatMoney(summary.outstanding)}
        </dd>
        <dt>Overdue</dt>
        <dd className="text-right tabular-nums">
          {formatMoney(summary.overdue)}
        </dd>
      </dl>
      <Link
        className="inline-block text-sm text-primary underline"
        href={`/customers/${customerId}/finance`}
      >
        View customer finances
      </Link>
      <p className="text-xs text-muted-foreground">
        Payment and credit workflows arrive in Step 6C.
      </p>
    </section>
  );
}
