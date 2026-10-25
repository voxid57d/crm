import { randomUUID } from "node:crypto";
import { allScopes } from "@/features/workspace/context";
import { saveStudent } from "@/features/customers/actions";
import type {
  customerOptions,
  getCustomer,
} from "@/features/customers/queries";
import { ActionForm } from "@/components/forms/action-form";
import { CustomerFields } from "./fields";
import { DuplicateChecker } from "./duplicate-checker";
export function StudentForm({
  options,
  record,
  enrollmentGroup,
  enrollmentBranch,
}: {
  options: Awaited<ReturnType<typeof customerOptions>>;
  record?: Awaited<ReturnType<typeof getCustomer>>;
  enrollmentGroup?: string;
  enrollmentBranch?: string;
}) {
  const w = options.workspace;
  const allowed = record
    ? allScopes(w, record.branchIds, "customers.update")
    : w.permissions.has("customers.create") &&
      w.permissions.has("customers.view");
  if (!allowed || record?.customer.archived_at)
    return (
      <p role="alert">
        Restore this contact and verify permission in every assigned branch
        before saving a student.
      </p>
    );
  return (
    <div className="space-y-5">
      <DuplicateChecker
        tenantId={w.tenant.id}
        customerId={record?.customer.id}
        phone={record?.customer.phone ?? ""}
        email={record?.customer.email ?? ""}
        name={
          record
            ? `${record.customer.first_name} ${record.customer.last_name}`
            : ""
        }
        studentFirst
        enrollmentGroup={enrollmentGroup}
      />
      {record && !record.student && (
        <p className="rounded-xl border bg-secondary p-4 text-sm">
          Using the existing contact: {record.customer.first_name}{" "}
          {record.customer.last_name}. Its invoices, payments, notes and
          identity will stay linked.
        </p>
      )}
      <ActionForm
        action={saveStudent}
        submit={record?.student ? "Save student" : "Create student"}
        className="space-y-6 rounded-xl border bg-white p-5 sm:p-7"
      >
        <input type="hidden" name="request_id" value={randomUUID()} />
        {enrollmentGroup && (
          <input type="hidden" name="enroll_group" value={enrollmentGroup} />
        )}
        <input
          type="hidden"
          name="student_mode"
          value={record?.student ? "edit" : "create"}
        />
        <CustomerFields
          options={options}
          customer={record?.customer}
          student={record?.student}
          branchIds={
            record?.branchIds ??
            (enrollmentBranch
              ? [enrollmentBranch]
              : w.branch
                ? [w.branch.id]
                : [])
          }
          tagIds={record?.tagIds}
          values={record?.values}
          studentFirst
        />
        {!record && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="separate_contact"
              className="mt-1 size-4 accent-primary"
            />
            If matches exist, I reviewed them and confirm this is a separate
            person. Shared family phone numbers are allowed.
          </label>
        )}
      </ActionForm>
    </div>
  );
}
