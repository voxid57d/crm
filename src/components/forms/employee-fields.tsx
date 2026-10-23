import { Field, SelectField } from "./field";
import type { Employee } from "@/features/employees/types";
import type { Branch } from "@/features/workspace/context";

export function EmployeeFields({
  tenantId,
  branches,
  employee,
  branchIds = [],
  today,
  canArchive,
}: {
  tenantId: string;
  branches: Branch[];
  employee?: Employee;
  branchIds?: string[];
  today: string;
  canArchive: boolean;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      {employee && (
        <input type="hidden" name="employee_id" value={employee.id} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          name="full_name"
          required
          maxLength={150}
          defaultValue={employee?.full_name ?? ""}
        />
        <Field
          label="Job title"
          name="job_title"
          maxLength={150}
          defaultValue={employee?.job_title ?? ""}
        />
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={employee?.phone ?? ""}
        />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          maxLength={254}
          defaultValue={employee?.email ?? ""}
        />
        <Field
          label="Employment start date"
          name="start_date"
          type="date"
          required
          defaultValue={employee?.start_date ?? today}
        />
        <SelectField
          label="Employment status"
          name="status"
          defaultValue={employee?.status ?? "active"}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          {(canArchive || employee?.status === "archived") && (
            <option value="archived">Archived</option>
          )}
        </SelectField>
      </div>
      <fieldset className="space-y-2 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Assigned branches</legend>
        {branches.map((branch) => (
          <label key={branch.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="branch_ids"
              value={branch.id}
              defaultChecked={branchIds.includes(branch.id)}
              className="size-4 accent-primary"
            />
            {branch.name}
            {!branch.is_active && " (inactive)"}
          </label>
        ))}
        <p className="pt-2 text-xs leading-5 text-muted-foreground">
          Owners and business-wide administrators can keep unassigned
          administrative records. Linked account assignments update together and
          require role management access.
        </p>
      </fieldset>
      <label className="block text-sm font-medium">
        Notes
        <textarea
          name="notes"
          defaultValue={employee?.notes ?? ""}
          maxLength={5000}
          rows={4}
          className="mt-2 block w-full rounded-lg border bg-white p-3 text-sm"
        />
      </label>
      <p className="text-xs leading-5 text-muted-foreground">
        Inactive and archived employees lose CRM access in this business.
        Records and salary history are retained. Salary amounts belong in the
        protected salary configuration, not in notes.
      </p>
    </>
  );
}
