import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEnrollment,
  businessDate,
} from "@/features/academics/group-queries";
import { enrollmentBilling } from "@/features/academics/integration-queries";
import { createEnrollmentInvoice } from "@/features/academics/integration-actions";
import { formatMoney } from "@/features/finance/money.mjs";
import { AcademicIdentity } from "@/components/academics/forms";
import { LinkedInvoices } from "@/components/academics/linked-invoices";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
export const metadata = { title: "Enrollment draft invoice" };
export default async function Page({
  params,
}: {
  params: Promise<{ enrollment: string }>;
}) {
  const id = (await params).enrollment,
    { workspace: w, detail: d } = await getEnrollment(id),
    billing = await enrollmentBilling(id);
  if (!billing.can_create || d.enrollment.agreed_price === undefined)
    notFound();
  const e = d.enrollment;
  return (
    <div className="max-w-3xl space-y-6">
      <Link className="text-primary underline" href={`/enrollments/${id}`}>
        Back to enrollment
      </Link>
      <h1 className="text-3xl font-semibold">
        Create enrollment draft invoice
      </h1>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Review this charge</h2>
        <p>
          Student and invoice debtor: <strong>{d.student.name}</strong> (
          {d.student.identifier})
        </p>
        <p>
          {d.group.course_name} · {d.group.name} · {d.group.branch_name}
        </p>
        <p>
          One agreed {e.pricing_model?.replaceAll("_", " ")} unit:{" "}
          <strong>{formatMoney(e.agreed_price!, e.currency)}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Specify the billed period or lesson in the description. A monthly or
          per-lesson agreement does not calculate a billing period. You can
          review and edit this draft through Finance before issuing it.
        </p>
        <p className="text-sm text-muted-foreground">
          The existing student contact will be the debtor. Guardians remain
          separate contacts; guardian-as-debtor billing is not available in this
          workflow. A separate payer identity is not supported yet; existing
          payment notes are descriptive only.
        </p>
      </section>
      {billing.total > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">
            Existing linked invoices ({billing.total})
          </h2>
          <LinkedInvoices rows={billing.rows} />
          <p className="text-sm text-muted-foreground">
            Check the full invoice history on the enrollment before creating
            another charge.
          </p>
        </section>
      )}
      <ActionForm
        action={createEnrollmentInvoice}
        submit="Create draft invoice"
        className="space-y-5 rounded-xl border bg-white p-5"
      >
        <AcademicIdentity
          tenantId={w.tenant.id}
          version={e.version}
          fields={{ enrollment_id: id }}
        />
        <Field
          label="Charge description / billing period"
          name="description"
          required
          maxLength={500}
          defaultValue={`${d.group.course_name} — ${d.group.name}`}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Issue date"
            name="issue_date"
            type="date"
            required
            defaultValue={businessDate(w)}
          />
          <Field
            label="Due date"
            name="due_date"
            type="date"
            required
            defaultValue={businessDate(w)}
          />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="confirm_draft"
            required
            className="mt-1"
          />
          <span>
            I reviewed existing charges and confirm this student contact is the
            intended debtor. Create one draft at the agreed unit price. Issuing
            and payment are separate actions.
          </span>
        </label>
      </ActionForm>
    </div>
  );
}
