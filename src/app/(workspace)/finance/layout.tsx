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
          Financial foundation
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          href="/finance/cashboxes"
        >
          Cashboxes
        </Link>
      </nav>
      {children}
    </div>
  );
}
