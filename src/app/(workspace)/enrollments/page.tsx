import {
  enrollmentDirectory,
  branchGrant,
} from "@/features/academics/group-queries";
import { enrollmentStatuses } from "@/features/academics/group-types";
import type { AcademicSearch } from "@/features/academics/types";
import { EnrollmentList } from "@/components/academics/enrollment-list";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Enrollments" };
export default async function Enrollments({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const d = await enrollmentDirectory(await searchParams),
    w = d.workspace;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Enrollments</h1>
      <p className="text-sm text-muted-foreground">
        Actual student agreements and academic history. Create enrollments from
        an authorized group.
      </p>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Search student, identifier or group"
          name="q"
          maxLength={100}
          defaultValue={d.filters.q}
        />
        {["group", "student"]
          .filter((k) => d.filters[k])
          .map((k) => (
            <input type="hidden" key={k} name={k} value={d.filters[k]} />
          ))}
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={d.filters.branch ?? ""}
        >
          <option value="">All authorized branches</option>
          {w.branches
            .filter((b) => branchGrant(w, "enrollments.view", b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Status"
          name="status"
          defaultValue={d.filters.status ?? "all"}
        >
          <option value="all">All statuses</option>
          <option value="open">Reserved seats</option>
          {enrollmentStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Sort"
          name="sort"
          defaultValue={d.filters.sort ?? "newest"}
        >
          <option value="newest">Newest first</option>
          <option value="student">Student name</option>
          <option value="start">Start date</option>
        </SelectField>
        <Button>Apply filters</Button>
      </form>
      <EnrollmentList
        rows={d.rows}
        total={d.total}
        page={d.page}
        path="/enrollments"
        filters={d.filters}
      />
    </div>
  );
}
