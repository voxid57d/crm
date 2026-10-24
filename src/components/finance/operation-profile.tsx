import Link from "next/link";
import {
  getOperation,
  hasFinance,
} from "@/features/finance/operations-queries";
import { uploadExpenseReceipt } from "@/features/finance/operations-actions";
import { formatMoney } from "@/features/finance/money.mjs";
import { financeDate } from "@/features/finance/queries";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { OperationIdentity, FinancialConfirmation } from "./operation-fields";
import { operationPaths } from "./operation-directory";
export async function OperationProfile({
  kind,
  id,
}: {
  kind: "expense" | "transfer";
  id: string;
}) {
  const { workspace: w, detail: d } = await getOperation(kind, id);
  const prefix = `${w.tenant.id}/expenses/${id}`;
  const receipts: { name: string; url: string }[] = [];
  if (kind === "expense") {
    const list = await w.supabase.storage
      .from("finance-receipts")
      .list(prefix, { limit: 100 });
    if (list.error) throw new Error("Private receipts could not load.");
    for (const file of list.data) {
      const link = await w.supabase.storage
        .from("finance-receipts")
        .createSignedUrl(`${prefix}/${file.name}`, 60, { download: true });
      if (link.error) throw new Error("Receipt link could not load.");
      receipts.push({ name: file.name, url: link.data.signedUrl });
    }
  }
  return (
    <div className="max-w-4xl space-y-6">
      <Link
        className="text-primary underline"
        href={`/finance/${operationPaths[kind]}`}
      >
        All {operationPaths[kind]}
      </Link>
      <h1 className="text-3xl font-semibold">
        {kind === "expense" ? d.category_name : "Cashbox transfer"} ·{" "}
        {d.reversed ? "Reversed" : "Posted"}
      </h1>
      <section className="space-y-3 rounded-xl border bg-white p-6">
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(d.amount, d.currency)}
        </p>
        <p>
          {d.cashbox_name}
          {d.destination_name ? ` → ${d.destination_name}` : ""}
        </p>
        <p className="whitespace-pre-wrap">{d.reason}</p>
        {d.vendor && <p>Vendor: {d.vendor}</p>}
        <p className="text-sm text-muted-foreground">
          {financeDate(d.occurred_at, w.tenant.timezone)} · {d.actor_name}
        </p>
        <Link
          className="text-primary underline"
          href={`/finance/transactions/${d.transaction_id}`}
        >
          View posting and correction options
        </Link>
      </section>
      {d.reversal && (
        <p className="rounded-xl border p-4 text-sm">
          Reversed by {d.reversal.actor_name}: {d.reversal.reason} ·{" "}
          {financeDate(d.reversal.occurred_at, w.tenant.timezone)}
        </p>
      )}
      {kind === "expense" && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Private receipts</h2>
          <p className="text-sm text-muted-foreground">
            PDF, PNG, JPEG or WebP, up to 5 MiB. Download links expire after one
            minute; reload to refresh.
          </p>
          <ul className="space-y-2">
            {receipts.map((r, i) => (
              <li key={r.name}>
                <a href={r.url} className="text-primary underline">
                  Download receipt {i + 1}
                </a>
              </li>
            ))}
          </ul>
          {!receipts.length && <p className="text-sm">No receipts attached.</p>}
          {d.branch_id && hasFinance(w, "expenses.create", d.branch_id) && (
            <ActionForm
              action={uploadExpenseReceipt}
              submit="Attach receipt"
              className="space-y-4 rounded-xl border bg-white p-5"
            >
              <OperationIdentity
                tenantId={w.tenant.id}
                fields={{ expense_id: id }}
              />
              <Field
                label="Receipt file"
                name="receipt"
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                required
              />
              <FinancialConfirmation />
            </ActionForm>
          )}
        </section>
      )}
    </div>
  );
}
