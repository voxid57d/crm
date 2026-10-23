import Link from "next/link";
import { getInvoice } from "@/features/finance/invoice-queries";
import { InvoiceDocument } from "@/components/finance/invoice-document";
import { PrintButton } from "@/components/finance/print-button";
export const metadata = {
  title: "Print invoice",
  robots: { index: false, follow: false },
};
export default async function PrintInvoice({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { detail } = await getInvoice(id);
  return (
    <main className="mx-auto max-w-5xl p-5 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          className="text-primary underline"
          href={`/finance/invoices/${id}`}
        >
          Back to invoice
        </Link>
        <PrintButton />
      </div>
      <InvoiceDocument detail={detail} />
      <style>
        {
          "@media print {body{background:white}article{border:0!important;padding:0!important}tr{break-inside:avoid}a{color:inherit;text-decoration:none}@page{margin:15mm}}"
        }
      </style>
    </main>
  );
}
