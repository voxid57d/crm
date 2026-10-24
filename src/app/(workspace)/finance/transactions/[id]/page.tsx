import Link from "next/link";
import { getTransaction } from "@/features/finance/operations-queries";
import { canCashbox, financeDate } from "@/features/finance/queries";
import { formatMoney } from "@/features/finance/money.mjs";
import { reverseTransaction } from "@/features/finance/operations-actions";
import { financialDateTime as localDateTime } from "@/lib/time.mjs";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import {
  OperationIdentity,
  FinancialConfirmation,
} from "@/components/finance/operation-fields";
export const metadata = { title: "Financial posting" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { workspace: w, detail: d } = await getTransaction(id);
  const reverse =
    !d.reversed &&
    ["opening_balance", "adjustment", "expense", "transfer"].includes(d.kind) &&
    d.cashboxes.every((b) => canCashbox(w, "finance.reverse", b.branch_id));
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">
        {d.kind.replaceAll("_", " ")} · {d.reversed ? "Reversed" : "Posted"}
      </h1>
      <p>{d.reason}</p>
      <p className="text-sm text-muted-foreground">
        Effective {financeDate(d.occurred_at, w.tenant.timezone)} · Recorded{" "}
        {financeDate(d.posted_at, w.tenant.timezone)} by {d.actor_name}
      </p>
      <ul className="divide-y rounded-xl border bg-white">
        {d.cashboxes.map((b) => (
          <li key={b.id} className="flex flex-wrap justify-between gap-4 p-5">
            <Link
              className="text-primary underline"
              href={`/finance/cashboxes/${b.id}`}
            >
              {b.name}
            </Link>
            <span className="tabular-nums">{formatMoney(b.amount)}</span>
          </li>
        ))}
      </ul>
      {d.reversal_of && (
        <Link
          className="text-primary underline"
          href={`/finance/transactions/${d.reversal_of}`}
        >
          Original posting
        </Link>
      )}
      {reverse && (
        <ActionForm
          action={reverseTransaction}
          submit="Reverse posting"
          confirmation="Post an exact opposite correction? The original history will remain."
          className="space-y-4 rounded-xl border bg-white p-6"
        >
          <h2 className="text-xl font-semibold">Correct this posting</h2>
          <p className="text-sm text-muted-foreground">
            An exact opposite movement will be posted to every original cashbox.
            Available balance and current permissions are checked again.
          </p>
          <OperationIdentity
            tenantId={w.tenant.id}
            fields={{ transaction_id: id }}
          />
          <Field
            label={`Correction date/time (${w.tenant.timezone})`}
            name="occurred_at"
            type="datetime-local"
            step="1"
            required
            defaultValue={localDateTime(
              new Date().toISOString(),
              w.tenant.timezone,
            )}
          />
          <Field
            label="Correction reason"
            name="reason"
            required
            minLength={3}
            maxLength={1000}
          />
          <FinancialConfirmation />
        </ActionForm>
      )}
    </div>
  );
}
