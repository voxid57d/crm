import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { saveCashbox } from "@/features/finance/actions";
import { canCashbox } from "@/features/finance/queries";
import type { Cashbox } from "@/features/finance/types";
import type { getWorkspace } from "@/features/workspace/context";

export function CashboxForm({
  workspace,
  cashbox,
}: {
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  cashbox?: Cashbox;
}) {
  const branches = workspace.branches.filter(
    (b) => b.is_active && canCashbox(workspace, "cashboxes.manage", b.id),
  );
  const global = canCashbox(workspace, "cashboxes.manage", null);
  if (!cashbox && !global && branches.length === 0)
    return (
      <p role="alert">
        Your role cannot create cashboxes in an active authorized branch.
      </p>
    );
  return (
    <ActionForm
      action={saveCashbox}
      submit={cashbox ? "Save cashbox" : "Create cashbox"}
      className="space-y-5 rounded-xl border bg-white p-5 md:p-7"
    >
      <input type="hidden" name="tenant_id" value={workspace.tenant.id} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      {cashbox && (
        <>
          <input type="hidden" name="cashbox_id" value={cashbox.id} />
          <input type="hidden" name="version" value={cashbox.version} />
          <input
            type="hidden"
            name="branch_id"
            value={cashbox.branch_id ?? ""}
          />
        </>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Cashbox name"
          name="name"
          required
          maxLength={100}
          defaultValue={cashbox?.name}
        />
        <SelectField
          label="Type"
          name="cashbox_type"
          defaultValue={cashbox?.cashbox_type ?? "cash"}
          required
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank account (manual)</option>
          <option value="other">Other</option>
        </SelectField>
        {!cashbox && (
          <SelectField
            label="Scope"
            name="branch_id"
            defaultValue={
              branches.some((b) => b.id === workspace.branch?.id)
                ? workspace.branch?.id
                : (branches[0]?.id ?? "")
            }
          >
            {global && <option value="">Business-wide</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          label="Status"
          name="is_active"
          defaultValue={cashbox?.is_active === false ? "false" : "true"}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </SelectField>
      </div>
      <p className="text-sm text-muted-foreground">
        Currency: UZS. Branch scope and currency are fixed after creation.
        Deactivation preserves the balance and history and prevents new
        postings.
      </p>
    </ActionForm>
  );
}
