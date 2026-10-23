import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getWorkspace } from "@/features/workspace/context";
export const metadata = { title: "Financial foundation" };
export default async function FinancePage() {
  const workspace = await getWorkspace();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Financial foundation
      </h1>
      <p className="text-sm text-muted-foreground">
        {workspace.tenant.name} ·{" "}
        {workspace.branch?.name ?? "Business workspace"} · UZS
      </p>
      {workspace.permissions.has("cashboxes.view") ? (
        <section className="space-y-4 rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">
            Cashboxes and posted history
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Track physical cash drawers, manually tracked bank accounts and
            branch reserves. Balances come from posted financial movements.
            Authorized users can record opening balances and reasoned
            adjustments.
          </p>
          <Button asChild>
            <Link href="/finance/cashboxes">Open cashboxes</Link>
          </Button>
        </section>
      ) : (
        !workspace.permissions.has("invoices.view") && (
          <p role="alert" className="rounded-xl border bg-white p-6">
            Your role has no financial access. Ask your business owner to review
            your permissions.
          </p>
        )
      )}
      {workspace.permissions.has("invoices.view") && (
        <section className="space-y-4 rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">
            Invoices and customer receivables
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Create and review drafts, issue numbered invoices and track
            outstanding debt. Issued documents retain their original details;
            authorized voids preserve the history.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/finance/invoices">Open invoices</Link>
            </Button>
            {workspace.permissions.has("debts.view") && (
              <Button asChild variant="outline">
                <Link href="/finance/debts">View receivables</Link>
              </Button>
            )}
          </div>
        </section>
      )}
      <section className="space-y-2 rounded-xl border border-dashed p-6">
        <h2 className="font-semibold">Coming in the next increments</h2>
        <p className="text-sm text-muted-foreground">
          Payments and allocations, then expenses, transfers and refunds, and
          finally financial dashboards and reports.
        </p>
      </section>
    </div>
  );
}
