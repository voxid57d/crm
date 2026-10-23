import { notFound } from "next/navigation";
import { getInvoice, canInvoice } from "@/features/finance/invoice-queries";
import { InvoiceEditor } from "@/components/finance/invoice-editor";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Edit invoice draft" };
export default async function EditInvoice({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FinanceSearch>;
}) {
  const { workspace, detail } = await getInvoice((await params).id);
  if (
    detail.invoice.state !== "draft" ||
    !canInvoice(workspace, "invoices.create", detail.invoice.branch_id)
  )
    notFound();
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Edit invoice draft
      </h1>
      <p className="text-sm text-muted-foreground">
        Changing the branch/customer requires access to both the old and new
        document scope. Issued documents cannot be edited.
      </p>
      <InvoiceEditor search={await searchParams} invoice={detail.invoice} />
    </div>
  );
}
