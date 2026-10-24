import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getInvoice, canInvoice } from "@/features/finance/invoice-queries";
import { pageNumber, financeDate } from "@/features/finance/queries";
import { transitionInvoice } from "@/features/finance/invoice-actions";
import type { Invoice } from "@/features/finance/invoice-types";
import type { FinanceSearch } from "@/features/finance/types";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/finance/invoice-document";
import { FinancePagination } from "@/components/finance/pagination";
import { formatMoney } from "@/features/finance/money.mjs";
import type { Json } from "@/lib/supabase/database.types";
export const metadata = { title: "Invoice details" };
const eventLabels: Record<string, string> = {
  invoice_created: "Draft created",
  invoice_updated: "Draft updated",
  invoice_issued: "Invoice issued",
  invoice_voided: "Invoice voided",
  invoice_discarded: "Draft discarded",
};
function Command({
  invoice,
  action,
}: {
  invoice: Invoice;
  action: "issue" | "void" | "discard";
}) {
  const label =
    action === "issue"
      ? "Issue invoice"
      : action === "void"
        ? "Void invoice"
        : "Discard draft";
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">{label}</h2>
      <p className="text-sm text-muted-foreground">
        {action === "issue"
          ? "Issuing assigns a number, freezes the document and creates the customer receivable."
          : action === "void"
            ? "Voiding offsets the full unpaid receivable and retains the original invoice. It does not refund cash."
            : "Discarding retains this draft and its history without creating debt."}
      </p>
      <ActionForm
        action={transitionInvoice}
        submit={label}
        confirmation={`${label}? Review the document before confirming.`}
      >
        <input type="hidden" name="tenant_id" value={invoice.tenant_id} />
        <input type="hidden" name="invoice_id" value={invoice.id} />
        <input type="hidden" name="version" value={invoice.version} />
        <input type="hidden" name="request_id" value={randomUUID()} />
        <input type="hidden" name="invoice_action" value={action} />
        {action !== "issue" && (
          <Field
            label="Reason"
            name="reason"
            required
            minLength={3}
            maxLength={1000}
          />
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            name="confirm_invoice"
            required
          />
          <span>I have reviewed this invoice and confirm this action.</span>
        </label>
      </ActionForm>
    </section>
  );
}
function AuditSnapshot({ data, label }: { data: Json; label: string }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const bill =
    data.bill_to &&
    typeof data.bill_to === "object" &&
    !Array.isArray(data.bill_to)
      ? data.bill_to
      : {};
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <details className="rounded-lg border p-3 text-xs">
      <summary className="cursor-pointer font-medium">{label}</summary>
      <p className="my-3">
        Customer: {typeof bill.name === "string" ? bill.name : ""} · Status:{" "}
        {typeof data.state === "string" ? data.state : ""}
      </p>
      <ol className="space-y-2">
        {items.map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item))
            return null;
          return (
            <li key={index}>
              {String(item.description ?? "")} · Quantity{" "}
              {String(item.quantity ?? "")} · Unit price{" "}
              {typeof item.unit_price === "string"
                ? formatMoney(item.unit_price)
                : ""}{" "}
              · Line total{" "}
              {typeof item.line_total === "string"
                ? formatMoney(item.line_total)
                : ""}
            </li>
          );
        })}
      </ol>
      <p className="mt-3">
        Invoice discount:{" "}
        {typeof data.discount_amount === "string"
          ? formatMoney(data.discount_amount)
          : ""}
      </p>
      {typeof data.notes === "string" && data.notes && (
        <p className="mt-2 whitespace-pre-wrap">Notes: {data.notes}</p>
      )}
    </details>
  );
}
export default async function InvoiceProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FinanceSearch>;
}) {
  const { id } = await params,
    search = await searchParams,
    auditPage = pageNumber(search, "audit_page");
  const { workspace, detail } = await getInvoice(id, auditPage),
    h = detail.invoice,
    path = `/finance/invoices/${id}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-primary underline"
            href="/finance/invoices"
          >
            All invoices
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {h.invoice_number ?? "Draft invoice"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {h.bill_to.name} · {h.branch_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {h.state === "issued" &&
            detail.outstanding !== "0.00" &&
            workspace.branchPermissions
              .get(h.branch_id)
              ?.has("payments.create") && (
              <Button asChild>
                <Link href={`/finance/payments/new?invoice=${id}`}>
                  Record payment for invoice
                </Link>
              </Button>
            )}
          <Button asChild variant="outline">
            <Link href={`${path}/print`}>Print / Save PDF</Link>
          </Button>
          {h.state === "draft" &&
            canInvoice(workspace, "invoices.create", h.branch_id) && (
              <Button asChild>
                <Link href={`${path}/edit`}>Edit draft</Link>
              </Button>
            )}
        </div>
      </div>
      {(search.saved === "1" || search.updated === "1") && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Invoice saved.
        </p>
      )}
      <InvoiceDocument detail={detail} />
      <div className="flex flex-wrap gap-4 text-sm text-primary">
        {detail.customer_visible && (
          <Link className="underline" href={`/customers/${h.customer_id}`}>
            Customer profile
          </Link>
        )}
        {detail.customer_visible &&
          canInvoice(workspace, "debts.view", h.branch_id) && (
            <Link
              className="underline"
              href={`/customers/${h.customer_id}/finance`}
            >
              Customer finances
            </Link>
          )}
        {h.replaces_invoice_id && (
          <Link
            className="underline"
            href={`/finance/invoices/${h.replaces_invoice_id}`}
          >
            Original invoice
          </Link>
        )}
        {h.state === "voided" &&
          canInvoice(workspace, "invoices.create", h.branch_id) && (
            <Link
              className="underline"
              href={`/finance/invoices/new?replacement=${id}`}
            >
              Create replacement draft
            </Link>
          )}
        {detail.replacements.map((r) => (
          <Link
            className="underline"
            href={`/finance/invoices/${r.id}`}
            key={r.id}
          >
            Replacement: {r.invoice_number ?? "draft"} ({r.state})
          </Link>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {h.state === "draft" &&
          canInvoice(workspace, "invoices.issue", h.branch_id) && (
            <Command invoice={h} action="issue" />
          )}
        {h.state === "draft" &&
          canInvoice(workspace, "invoices.create", h.branch_id) && (
            <Command invoice={h} action="discard" />
          )}
        {h.state === "issued" &&
          canInvoice(workspace, "invoices.void", h.branch_id) && (
            <Command invoice={h} action="void" />
          )}
      </div>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Receivable history</h2>
        <p className="text-sm text-muted-foreground">
          These entries track billed debt and void offsets. They do not move
          cash. Allocations and releases change debt without posting cash again.
        </p>
        {detail.receivables.length ? (
          <ul className="divide-y rounded-xl border bg-white">
            {detail.receivables.map((e) => (
              <li
                className="flex flex-wrap justify-between gap-3 p-4 text-sm"
                key={e.id}
              >
                <span>
                  {{
                    issue: "Issued charge",
                    void: "Void offset",
                    allocation: "Payment allocation",
                    allocation_release: "Allocation released",
                  }[e.kind] ?? e.kind}{" "}
                  · {financeDate(e.created_at, workspace.tenant.timezone)}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(e.amount, h.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            This document has no posted receivable.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Invoice history</h2>
        <ol className="divide-y rounded-xl border bg-white">
          {detail.history.map((e) => (
            <li className="space-y-3 p-5" key={e.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <p className="font-medium">
                  {eventLabels[e.operation] ?? e.operation}
                </p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={e.created_at}
                >
                  {financeDate(e.created_at, workspace.tenant.timezone)}
                </time>
              </div>
              <p className="text-sm">
                {e.actor_name}
                {e.reason ? ` · ${e.reason}` : ""}
              </p>
              {canInvoice(workspace, "finance.audit.view", h.branch_id) && (
                <>
                  <AuditSnapshot data={e.before_data} label="Before change" />
                  <AuditSnapshot data={e.after_data} label="After change" />
                </>
              )}
            </li>
          ))}
        </ol>
        <FinancePagination
          path={path}
          filters={{}}
          page={auditPage}
          pageKey="audit_page"
          total={detail.audit_total}
        />
      </section>
    </div>
  );
}
