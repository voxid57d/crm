import Link from "next/link";
import type { LinkedInvoice } from "@/features/academics/integration-types";
import { formatMoney } from "@/features/finance/money.mjs";
import { Badge } from "@/components/ui/badge";
export function LinkedInvoices({ rows }: { rows: LinkedInvoice[] }) {
  return (
    <div className="space-y-3">
      {rows.map((i) => (
        <article
          key={i.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 text-sm"
        >
          <div>
            <Link
              className="font-medium text-primary underline"
              href={`/finance/invoices/${i.id}`}
            >
              {i.invoice_number ?? "Unnumbered draft"} · {i.issue_date}
            </Link>
            {i.enrollment_id && (
              <p className="mt-2">
                <Link
                  className="text-primary underline"
                  href={`/enrollments/${i.enrollment_id}`}
                >
                  {i.group_name} enrollment
                </Link>
              </p>
            )}
          </div>
          <Badge variant="outline">{i.state}</Badge>
          <span className="tabular-nums">
            {formatMoney(i.total, i.currency)}
          </span>
        </article>
      ))}
      {!rows.length && (
        <p className="text-sm text-muted-foreground">
          No authorized linked invoices on this page.
        </p>
      )}
    </div>
  );
}
