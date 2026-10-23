import { ActionForm } from "@/components/forms/action-form";
import { SelectField } from "@/components/forms/field";
import { selectBranch, selectBusiness } from "@/features/workspace/actions";
import type { Tenant, Branch } from "@/features/workspace/context";

export function WorkspaceControls({
  businesses,
  tenant,
  branches,
  branch,
}: {
  businesses: Tenant[];
  tenant: Tenant;
  branches: Branch[];
  branch: Branch | null;
}) {
  const active = branches.filter((item) => item.is_active);
  return (
    <div className="flex flex-wrap gap-5 border-b bg-white px-5 py-4 md:px-9">
      <ActionForm
        action={selectBusiness}
        submit="Switch business"
        className="flex flex-wrap items-end gap-2"
      >
        <SelectField label="Business" name="tenant_id" defaultValue={tenant.id}>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </SelectField>
      </ActionForm>
      {active.length > 0 ? (
        <ActionForm
          action={selectBranch}
          submit="Switch branch"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <SelectField
            label="Branch"
            name="branch_id"
            defaultValue={branch?.id ?? ""}
            required
          >
            <option value="" disabled>
              Select a branch
            </option>
            {active.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        </ActionForm>
      ) : (
        <p className="self-center text-sm text-muted-foreground">
          No active authorized branches. Contact the business Owner.
        </p>
      )}
    </div>
  );
}
