import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/finance/invoice-editor";
import { getInvoice } from "@/features/finance/invoice-queries";
import { value } from "@/features/finance/queries";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Create invoice" };
export default async function NewInvoice({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  const search = await searchParams,
    source = value(search, "replacement");
  const copy = source ? (await getInvoice(source)).detail.invoice : undefined;
  if (copy && copy.state !== "voided") notFound();
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {copy ? "Create replacement invoice" : "Create invoice"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {copy
          ? `The new draft links to ${copy.invoice_number}. The voided original remains unchanged.`
          : "Save a draft and review exact totals before issuing. Payments will be added in the next increment."}
      </p>
      <InvoiceEditor search={search} copy={copy} />
    </div>
  );
}
