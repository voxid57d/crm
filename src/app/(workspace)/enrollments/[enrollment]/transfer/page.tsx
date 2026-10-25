import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEnrollment,
  groupDirectory,
  businessDate,
  branchGrant,
} from "@/features/academics/group-queries";
import { TransferForm } from "@/components/academics/delivery-forms";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
import { queryValue } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
export const metadata = { title: "Transfer student" };
export default async function Transfer({
  params,
  searchParams,
}: {
  params: Promise<{ enrollment: string }>;
  searchParams: Promise<AcademicSearch>;
}) {
  const id = (await params).enrollment,
    search = await searchParams,
    { workspace: w, detail: d } = await getEnrollment(id);
  if (
    !d.can_transfer ||
    !["pending", "active", "paused"].includes(d.enrollment.status)
  )
    notFound();
  const q = queryValue(search, "q").slice(0, 100),
    targets = await groupDirectory(
      { q, status: "open", page: queryValue(search, "page") },
      false,
    );
  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/enrollments/${id}`} className="text-primary underline">
        Original enrollment
      </Link>
      <h1 className="text-3xl font-semibold">Transfer · {d.student.name}</h1>
      <p className="text-sm text-muted-foreground">
        From {d.group.name} · {d.group.branch_name}. Both groups and the
        original student must be authorized.
      </p>
      <form className="flex flex-wrap items-end gap-4">
        <Field
          label="Search destination group name or code"
          name="q"
          defaultValue={q}
          maxLength={100}
        />
        <Button variant="outline">Search groups</Button>
      </form>
      <TransferForm
        tenantId={w.tenant.id}
        enrollment={d.enrollment}
        targets={targets.rows.filter(
          (g) =>
            branchGrant(w, "enrollments.transfer", g.branch_id) &&
            branchGrant(w, "enrollments.create", g.branch_id) &&
            branchGrant(w, "enrollments.view_pricing", g.branch_id),
        )}
        today={businessDate(w)}
      />
      <Pagination
        path={`/enrollments/${id}/transfer`}
        filters={{ q }}
        page={targets.page}
        total={targets.total}
      />
    </div>
  );
}
