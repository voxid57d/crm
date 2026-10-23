import { Field, SelectField } from "@/components/forms/field";
import { StudentFields } from "./student-fields";
import type { Customer, Student } from "@/features/customers/types";
import type { customerOptions } from "@/features/customers/queries";
import { allScopes } from "@/features/workspace/context";

export function TextArea({
  label,
  name,
  value = "",
  maxLength = 5000,
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea
        name={name}
        defaultValue={value}
        maxLength={maxLength}
        required={required}
        rows={4}
        className="mt-1.5 w-full rounded-lg border bg-white p-3 text-sm focus-visible:outline-ring"
      />
    </label>
  );
}
export function CustomerIdentity({
  tenantId,
  customerId,
}: {
  tenantId: string;
  customerId?: string;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      {customerId && (
        <input type="hidden" name="customer_id" value={customerId} />
      )}
    </>
  );
}
export function CustomerFields({
  options,
  customer,
  student,
  branchIds,
  tagIds = [],
  values = [],
}: {
  options: Awaited<ReturnType<typeof customerOptions>>;
  customer?: Customer;
  student?: Student | null;
  branchIds: string[];
  tagIds?: string[];
  values?: { field_id: string; value: string }[];
}) {
  const { workspace, statuses, tags, fields, employees } = options;
  const permission = customer ? "customers.update" : "customers.create";
  const permitted = workspace.branches.filter((b) =>
    allScopes(workspace, [b.id], permission),
  );
  return (
    <>
      <CustomerIdentity
        tenantId={workspace.tenant.id}
        customerId={customer?.id}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          name="first_name"
          required
          maxLength={100}
          defaultValue={customer?.first_name}
        />
        <Field
          label="Last name (optional)"
          name="last_name"
          maxLength={100}
          defaultValue={customer?.last_name}
        />
        <Field
          label="Phone number"
          name="phone"
          required
          minLength={3}
          maxLength={40}
          type="tel"
          defaultValue={customer?.phone}
        />
        <Field
          label="Additional phone (optional)"
          name="additional_phone"
          type="tel"
          maxLength={40}
          defaultValue={customer?.additional_phone ?? ""}
        />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          maxLength={254}
          defaultValue={customer?.email ?? ""}
        />
        <Field
          label="Date of birth (optional)"
          name="date_of_birth"
          type="date"
          defaultValue={customer?.date_of_birth ?? ""}
        />
        <SelectField
          label="Gender (optional)"
          name="gender"
          defaultValue={customer?.gender ?? ""}
        >
          <option value="">Not provided</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
          <option value="undisclosed">Prefer not to say</option>
        </SelectField>
        <SelectField
          label="Customer status"
          name="status_id"
          defaultValue={
            customer?.status_id ?? statuses.find((s) => s.is_default)?.id
          }
        >
          {statuses
            .filter((s) => s.is_active || s.id === customer?.status_id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {!s.is_active ? " (inactive option)" : ""}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Responsible employee (optional)"
          name="responsible_employee_id"
          defaultValue={customer?.responsible_employee_id ?? ""}
        >
          <option value="">Unassigned</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
          {customer?.responsible_employee_id &&
            !employees.some(
              (e) => e.id === customer.responsible_employee_id,
            ) && (
              <option value={customer.responsible_employee_id}>
                Unavailable employee — choose another or unassign
              </option>
            )}
        </SelectField>
      </div>
      <TextArea
        label="Address (optional)"
        name="address"
        value={customer?.address ?? ""}
        maxLength={1000}
      />
      <fieldset className="rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Assigned branches</legend>
        <div className="flex flex-wrap gap-5">
          {permitted.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="branch_ids"
                value={b.id}
                defaultChecked={branchIds.includes(b.id)}
                className="size-4 accent-primary"
              />
              {b.name}
              {!b.is_active ? " (inactive)" : ""}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Shared contacts require permission in every assigned branch. The
          responsible employee must belong to at least one assigned branch.
          Unassigned contacts require business-wide access.
        </p>
      </fieldset>
      <fieldset className="rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Tags</legend>
        <div className="flex flex-wrap gap-4">
          {tags
            .filter((t) => t.is_active || tagIds.includes(t.id))
            .map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="tag_ids"
                  value={t.id}
                  defaultChecked={tagIds.includes(t.id)}
                  className="size-4 accent-primary"
                />
                {t.name}
                {!t.is_active ? " (inactive)" : ""}
              </label>
            ))}
          {!tags.length && (
            <p className="text-sm text-muted-foreground">
              No tags configured yet.
            </p>
          )}
        </div>
      </fieldset>
      <StudentFields student={student ?? null} />
      {fields.some((f) => f.is_active) && (
        <fieldset className="rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            Additional fields
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields
              .filter((f) => f.is_active)
              .map((f) =>
                f.field_type === "boolean" ? (
                  <SelectField
                    key={f.id}
                    label={`${f.name} (optional)`}
                    name={`field_${f.id}`}
                    defaultValue={
                      values.find((v) => v.field_id === f.id)?.value ?? ""
                    }
                  >
                    <option value="">Not provided</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </SelectField>
                ) : (
                  <Field
                    key={f.id}
                    label={`${f.name} (optional)`}
                    name={`field_${f.id}`}
                    type={
                      f.field_type === "date"
                        ? "date"
                        : f.field_type === "number"
                          ? "number"
                          : "text"
                    }
                    step={f.field_type === "number" ? "0.000001" : undefined}
                    maxLength={2000}
                    defaultValue={
                      values.find((v) => v.field_id === f.id)?.value ?? ""
                    }
                  />
                ),
              )}
          </div>
        </fieldset>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Phone numbers and email addresses may be shared. Possible duplicates are
        suggestions; records are never merged automatically. Internal notes are
        managed separately on the saved profile.
      </p>
    </>
  );
}
