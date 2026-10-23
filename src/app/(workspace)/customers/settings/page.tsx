import { customerOptions } from "@/features/customers/queries";
import { saveSetting } from "@/features/customers/actions";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";

export const metadata = { title: "Customer tags & settings" };
function SettingFields({
  tenantId,
  kind,
  row,
}: {
  tenantId: string;
  kind: string;
  row?: { id: string; name: string; is_active: boolean; field_type?: string };
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="kind" value={kind} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <Field
        label="Name"
        name="name"
        required
        maxLength={80}
        defaultValue={row?.name}
      />
      {kind === "field" &&
        (row ? (
          <>
            <input type="hidden" name="field_type" value={row.field_type} />
            <p className="text-xs text-muted-foreground">
              Type: {row.field_type} (fixed)
            </p>
          </>
        ) : (
          <SelectField label="Field type" name="field_type" defaultValue="text">
            {["text", "number", "date", "boolean"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
        ))}
      <SelectField
        label="Availability"
        name="is_active"
        defaultValue={String(row?.is_active ?? true)}
      >
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </SelectField>
    </>
  );
}
export default async function CustomerSettings() {
  const { workspace, statuses, tags, fields } = await customerOptions();
  const groups = [
    {
      kind: "status",
      title: "Customer statuses",
      rows: statuses,
      permission: "customers.manage_settings",
    },
    {
      kind: "tag",
      title: "Customer tags",
      rows: tags,
      permission: "customers.manage_tags",
    },
    {
      kind: "field",
      title: "Custom fields",
      rows: fields,
      permission: "customers.manage_settings",
    },
  ].filter((g) => workspace.businessPermissions.has(g.permission));
  if (!groups.length)
    return (
      <p role="alert">
        Business-wide customer settings or tag management permission is
        required.
      </p>
    );
  return (
    <div className="space-y-7">
      <h1 className="text-3xl font-semibold">Customer tags & settings</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Configure this business only. Customer statuses describe the
        relationship, separate from future sales funnel stages. Deactivating
        options preserves existing references and history. The default status
        must remain active; field types cannot change.
      </p>
      {groups.map((g) => (
        <section key={g.kind} className="space-y-4">
          <h2 className="text-xl font-semibold">{g.title}</h2>
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-4 font-medium">Create {g.kind}</h3>
              <ActionForm action={saveSetting} submit={`Create ${g.kind}`}>
                <SettingFields tenantId={workspace.tenant.id} kind={g.kind} />
              </ActionForm>
            </div>
            {g.rows.map((row) => (
              <details key={row.id} className="rounded-xl border bg-white p-5">
                <summary className="cursor-pointer text-sm font-medium">
                  {row.name}
                  {!row.is_active ? " · Inactive" : ""}
                  {"is_default" in row && row.is_default ? " · Default" : ""}
                </summary>
                <div className="mt-4">
                  <ActionForm action={saveSetting} submit="Save configuration">
                    <SettingFields
                      tenantId={workspace.tenant.id}
                      kind={g.kind}
                      row={row}
                    />
                  </ActionForm>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
