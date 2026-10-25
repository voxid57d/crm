import Link from "next/link";
import { enrollmentBilling } from "@/features/academics/integration-queries";
import { LinkedInvoices } from "./linked-invoices";
import { FinancePagination } from "@/components/finance/pagination";
import { Button } from "@/components/ui/button";
export async function EnrollmentBillingPanel({
  id,
  page,
}: {
  id: string;
  page: number;
}) {
  const d = await enrollmentBilling(id, page);
  return (
    <section id="billing" className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-xl font-semibold">Enrollment invoices</h2>
      <p className="text-sm text-muted-foreground">
        Charges use the existing invoice system. Review linked drafts before
        creating another charge. Enrollment and lesson changes do not bill
        automatically.
      </p>
      {d.can_create && (
        <Button asChild variant="outline">
          <Link href={`/enrollments/${id}/invoice`}>Create draft invoice</Link>
        </Button>
      )}
      {d.can_view ? (
        <>
          <LinkedInvoices rows={d.rows} />
          <FinancePagination
            path={`/enrollments/${id}`}
            filters={{}}
            pageKey="invoice_page"
            anchor="#billing"
            page={page}
            total={d.total}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Financial information is restricted.
        </p>
      )}
    </section>
  );
}
