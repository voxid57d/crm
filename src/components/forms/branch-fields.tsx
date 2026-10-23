import { Field, SelectField } from "./field";
import type { Branch } from "@/features/workspace/context";

export function BranchFields({
  tenantId,
  branch,
}: {
  tenantId: string;
  branch?: Branch;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      {branch && <input type="hidden" name="branch_id" value={branch.id} />}
      <Field
        label="Branch name"
        name="name"
        required
        maxLength={150}
        defaultValue={branch?.name ?? ""}
      />
      <Field
        label="Address"
        name="address"
        maxLength={500}
        defaultValue={branch?.address ?? ""}
      />
      <Field
        label="Phone number"
        name="phone"
        type="tel"
        maxLength={40}
        defaultValue={branch?.phone ?? ""}
      />
      <SelectField
        label="Status"
        name="is_active"
        defaultValue={String(branch?.is_active ?? true)}
      >
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </SelectField>
    </>
  );
}
