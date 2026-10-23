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
        <p role="alert" className="rounded-xl border bg-white p-6">
          Your role has no financial access. Ask your business owner to review
          your permissions.
        </p>
      )}
      <section className="space-y-2 rounded-xl border border-dashed p-6">
        <h2 className="font-semibold">Coming in the next increments</h2>
        <p className="text-sm text-muted-foreground">
          Invoices and receivables, followed by payments and allocations, then
          expenses, transfers and refunds, and finally financial dashboards and
          reports.
        </p>
      </section>
    </div>
  );
}
