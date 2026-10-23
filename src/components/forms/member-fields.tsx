import { Field, SelectField } from "./field";
import type { Branch } from "@/features/workspace/context";
import type { Database } from "@/lib/supabase/schema";

type Member =
  Database["public"]["Functions"]["list_business_members"]["Returns"][number];

export function MemberFields({
  tenantId,
  branches,
  member,
}: {
  tenantId: string;
  branches: Branch[];
  member?: Member;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <Field
        label="Registered account email"
        name="email"
        type="email"
        required
        maxLength={254}
        defaultValue={member?.email ?? ""}
        readOnly={Boolean(member)}
      />
      <SelectField
        label="Role"
        name="role"
        defaultValue={member?.role ?? "employee"}
      >
        <option value="employee">Employee</option>
        <option value="manager">Branch Manager</option>
        <option value="admin">Admin</option>
        {member && ["teacher", "staff"].includes(member.role) && (
          <option value={member.role} disabled>
            Choose a current role
          </option>
        )}
      </SelectField>
      <SelectField
        label="Membership status"
        name="is_active"
        defaultValue={String(member?.is_active ?? true)}
      >
        <option value="true">Active</option>
        <option value="false">Suspended</option>
      </SelectField>
      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Branch assignments</legend>
        {branches.map((branch) => (
          <label key={branch.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="branch_ids"
              value={branch.id}
              defaultChecked={member?.branch_ids.includes(branch.id)}
              className="size-4 accent-primary"
            />
            {branch.name}
            {!branch.is_active && " (inactive)"}
          </label>
        ))}
        <p className="pt-2 text-xs leading-5 text-muted-foreground">
          Managers and Employees need at least one assignment when active.
          Admins have all-branch access. Saving replaces this member’s
          assignments.
        </p>
      </fieldset>
    </>
  );
}
