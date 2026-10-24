import Link from "next/link";
export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <nav
        aria-label="Finance navigation"
        className="flex flex-wrap gap-4 border-b pb-4 text-sm"
      >
        <Link
          className="text-primary underline underline-offset-4"
          href="/finance"
        >
          Finance home
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          href="/finance/cashboxes"
        >
          Cashboxes
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          href="/finance/invoices"
        >
          Invoices
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          href="/finance/debts"
        >
          Receivables
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          href="/finance/payments"
        >
          Payments
        </Link>
      </nav>
      {children}
    </div>
  );
}
