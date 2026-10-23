import { Field, SelectField } from "./field";
import type { BusinessRole } from "@/features/employees/types";
import type { Branch } from "@/features/workspace/context";

export function RoleFields({
  tenantId,
  role,
  permissions,
  selected = [],
}: {
  tenantId: string;
  role?: BusinessRole;
  permissions: { key: string }[];
  selected?: string[];
}) {
  const groups = Map.groupBy(permissions, (p) => p.key.split(".")[0]);
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      {role && <input type="hidden" name="role_id" value={role.id} />}
      <Field
        label="Role name"
        name="name"
        required
        maxLength={80}
        defaultValue={role?.name ?? ""}
      />
      {role ? (
        <>
          <input type="hidden" name="scope" value={role.scope} />
          <p className="text-sm text-muted-foreground">
            Scope: {role.scope}. Create a new role to change scope.
          </p>
        </>
      ) : (
        <SelectField label="Access scope" name="scope" defaultValue="branch">
          <option value="branch">Assigned branches only</option>
          <option value="business">Business-wide (all branches)</option>
        </SelectField>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Branch roles operate only where explicitly assigned. Role management is
        business-wide only. Customer settings and tag configuration also require
        business-wide grants. Sales pipeline/source configuration requires
        business-wide sales grants. Cashbox management, balance adjustments and
        audit viewing have separate permissions; business-wide cashboxes require
        business-wide grants. Payment, learning and general report permissions
        reserve future capabilities.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from(groups, ([group, items]) => (
          <fieldset key={group} className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide">
              {group}
            </legend>
            {items.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="permissions"
                  value={p.key}
                  defaultChecked={
                    selected.includes(p.key) ||
                    (!role && p.key === "branches.view")
                  }
                  className="size-4 accent-primary"
                />
                {p.key}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </>
  );
}
export function MemberRoleFields({
  tenantId,
  userId,
  roleId,
  roles,
  branches,
  branchIds,
  overrides,
  active,
}: {
  tenantId: string;
  userId: string;
  roleId: string;
  roles: BusinessRole[];
  branches: Branch[];
  branchIds: string[];
  overrides: Record<string, string | null>;
  active: boolean;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="user_id" value={userId} />
      <SelectField
        label="Default business membership role"
        name="role_id"
        defaultValue={roleId}
      >
        {roles
          .filter((r) => r.system_key !== "owner")
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.scope})
            </option>
          ))}
      </SelectField>
      <SelectField
        label="Membership status"
        name="is_active"
        defaultValue={String(active)}
      >
        <option value="true">Active</option>
        <option value="false">Suspended</option>
      </SelectField>
      <fieldset className="space-y-4 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Branch access and role overrides
        </legend>
        {branches.map((b) => (
          <div key={b.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="branch_ids"
                type="checkbox"
                value={b.id}
                defaultChecked={branchIds.includes(b.id)}
                className="size-4 accent-primary"
              />
              {b.name}
              {!b.is_active && " (inactive)"}
            </label>
            <SelectField
              label={`Role within ${b.name}`}
              name={`branch_role_${b.id}`}
              defaultValue={overrides[b.id] ?? ""}
            >
              <option value="">Inherit membership role</option>
              {roles
                .filter((r) => r.scope === "branch")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </SelectField>
          </div>
        ))}
        <p className="text-xs leading-5 text-muted-foreground">
          A business-wide membership remains business-wide; branch overrides
          apply to branch-scoped memberships. Saving replaces selected login
          branch assignments and synchronizes active linked employee
          assignments.
        </p>
      </fieldset>
    </>
  );
}
