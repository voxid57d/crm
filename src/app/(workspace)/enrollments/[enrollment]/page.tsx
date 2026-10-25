import Link from "next/link";
import { getEnrollment } from "@/features/academics/group-queries";
import { academicPage } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { formatMoney } from "@/features/finance/money.mjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnrollmentUpdateForm } from "@/components/academics/delivery-forms";
import { AcademicHistoryPanel } from "@/components/academics/history";
import { EnrollmentBillingPanel } from "@/components/academics/enrollment-billing";
export const metadata = { title: "Enrollment details" };
export default async function EnrollmentProfile({
  params,
  searchParams,
}: {
  params: Promise<{ enrollment: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).enrollment,
    search = await searchParams,
    page = academicPage(search, "history_page"),
    { workspace: w, detail: d } = await getEnrollment(id, page),
    e = d.enrollment;
  return (
    <div className="space-y-6">
      <Link className="text-primary underline" href="/enrollments">
        Enrollments
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{d.student.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {d.student.identifier} · {d.group.name}
          </p>
        </div>
        <Badge variant="outline">{e.status}</Badge>
      </div>
      {search.saved === "1" && (
        <p
          role="status"
          className="rounded-lg bg-secondary p-3 text-sm text-primary"
        >
          Enrollment saved.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`/groups/${e.group_id}`}>Group and roster</Link>
        </Button>
        {d.student.can_open && (
          <Button asChild variant="outline">
            <Link href={`/students/${e.customer_id}`}>Student profile</Link>
          </Button>
        )}
        {d.can_transfer &&
          ["pending", "active", "paused"].includes(e.status) && (
            <Button asChild variant="outline">
              <Link href={`/enrollments/${id}/transfer`}>
                Transfer to another group
              </Link>
            </Button>
          )}
      </div>
      <section className="space-y-5 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Enrollment agreement</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Course", d.group.course_name],
            ["Branch", d.group.branch_name],
            ["Enrollment date", e.enrollment_date],
            [
              "Effective period",
              `${e.effective_start_date} → ${e.effective_end_date ?? "Open"}`,
            ],
            [
              "Agreed tuition",
              e.agreed_price === undefined
                ? "Restricted"
                : formatMoney(e.agreed_price, e.currency),
            ],
            [
              "Pricing model",
              e.pricing_model?.replaceAll("_", " ") ?? "Restricted",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        {e.notes && <p className="whitespace-pre-wrap text-sm">{e.notes}</p>}
        <p className="text-sm text-muted-foreground">
          Agreement terms are retained independently of catalog prices.
          Enrollment changes never issue invoices, collect payments or move
          existing financial records.
        </p>
        {e.transferred_from_id && (
          <p className="text-sm">
            Transferred from enrollment{" "}
            <Link
              className="text-primary underline"
              href={`/enrollments/${e.transferred_from_id}`}
            >
              View source (requires source access)
            </Link>
          </p>
        )}
        {d.transferred_to && (
          <p className="text-sm">
            Transferred to{" "}
            <Link
              className="text-primary underline"
              href={`/enrollments/${d.transferred_to}`}
            >
              Destination enrollment
            </Link>
          </p>
        )}
      </section>
      {d.can_update && (
        <EnrollmentUpdateForm
          tenantId={w.tenant.id}
          enrollment={e}
          canWithdraw={d.can_withdraw}
        />
      )}{" "}
      <EnrollmentBillingPanel
        id={id}
        page={academicPage(search, "invoice_page")}
      />
      {d.history.total > 0 && (
        <AcademicHistoryPanel
          title="Enrollment history"
          history={d.history}
          zone={w.tenant.timezone}
          path={`/enrollments/${id}`}
          page={page}
        />
      )}
    </div>
  );
}
