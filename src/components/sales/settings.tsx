import { StageOrder } from "./stage-order";
import { salesOptions } from "@/features/sales/queries";
import { saveSalesSetting } from "@/features/sales/actions";
import { SalesIdentity } from "./fields";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
function BasicSetting({
  tenantId,
  kind,
  row,
}: {
  tenantId: string;
  kind: string;
  row?: { id: string; name: string; is_active: boolean };
}) {
  return (
    <>
      <SalesIdentity tenantId={tenantId} />
      <input type="hidden" name="setting_kind" value={kind} />
      {row && <input type="hidden" name="setting_id" value={row.id} />}
      <Field
        label="Name"
        name="name"
        required
        maxLength={80}
        defaultValue={row?.name}
      />
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
export async function SalesSettings({
  sourcesOnly = false,
}: {
  sourcesOnly?: boolean;
}) {
  const { workspace, pipelines, stages, sources, reasons } =
    await salesOptions();
  if (
    !workspace.businessPermissions.has(
      sourcesOnly ? "leads.manage_sources" : "leads.manage_pipelines",
    )
  )
    return (
      <p role="alert">
        Business-wide sales configuration permission is required.
      </p>
    );
  return (
    <div className="space-y-7">
      <h1 className="text-3xl font-semibold">
        {sourcesOnly
          ? "Lead sources & loss reasons"
          : "Sales pipeline settings"}
      </h1>
      <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
        Changes apply only to this business and are recorded in configuration
        history. Deactivate options to preserve past associations. Stages cannot
        be deleted; existing stage outcome and pipeline are fixed. New pipelines
        start with New, Converted, Lost and Disqualified stages.
      </p>
      {sourcesOnly ? (
        [
          { kind: "source", title: "Sources", rows: sources },
          { kind: "loss_reason", title: "Loss reasons", rows: reasons },
        ].map((group) => (
          <section key={group.kind} className="space-y-4">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border bg-white p-5">
                <h3 className="mb-4 font-medium">
                  Add {group.kind.replaceAll("_", " ")}
                </h3>
                <ActionForm action={saveSalesSetting} submit="Create option">
                  <BasicSetting
                    tenantId={workspace.tenant.id}
                    kind={group.kind}
                  />
                </ActionForm>
              </div>
              {group.rows.map((row) => (
                <details
                  key={row.id}
                  className="rounded-xl border bg-white p-5"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {row.name}
                    {row.is_active ? "" : " · Inactive"}
                  </summary>
                  <div className="mt-4">
                    <ActionForm action={saveSalesSetting} submit="Save option">
                      <BasicSetting
                        tenantId={workspace.tenant.id}
                        kind={group.kind}
                        row={row}
                      />
                    </ActionForm>
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))
      ) : (
        <>
          <section className="max-w-lg rounded-xl border bg-white p-5">
            <h2 className="mb-4 font-semibold">Create pipeline</h2>
            <ActionForm action={saveSalesSetting} submit="Create pipeline">
              <BasicSetting tenantId={workspace.tenant.id} kind="pipeline" />
            </ActionForm>
          </section>
          {pipelines.map((pipeline) => (
            <section
              key={pipeline.id}
              className="space-y-4 rounded-xl border bg-white p-5"
            >
              <h2 className="text-lg font-semibold">
                {pipeline.name}
                {pipeline.is_default ? " · Default" : ""}
              </h2>
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Rename / deactivate pipeline
                </summary>
                <div className="mt-4 max-w-lg">
                  <ActionForm action={saveSalesSetting} submit="Save pipeline">
                    <BasicSetting
                      tenantId={workspace.tenant.id}
                      kind="pipeline"
                      row={pipeline}
                    />
                  </ActionForm>
                </div>
              </details>
              <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ...stages.filter((s) => s.pipeline_id === pipeline.id),
                  null,
                ].map((stage, i) => (
                  <details
                    key={stage?.id ?? "new"}
                    className="rounded-lg border p-4"
                    open={!stage}
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      {stage
                        ? `${stage.position + 1}. ${stage.name}${stage.is_active ? "" : " · Inactive"}`
                        : "Add stage"}
                    </summary>
                    <div className="mt-4">
                      <ActionForm
                        action={saveSalesSetting}
                        submit={stage ? "Save stage" : "Create stage"}
                      >
                        <BasicSetting
                          tenantId={workspace.tenant.id}
                          kind="stage"
                          row={stage ?? undefined}
                        />
                        <input
                          type="hidden"
                          name="pipeline_id"
                          value={pipeline.id}
                        />
                        <input
                          name="position"
                          type="hidden"
                          value={(stage?.position ?? i) + 1}
                        />
                        <Field
                          label="Column color"
                          name="color"
                          type="color"
                          required
                          defaultValue={stage?.color ?? "#64748b"}
                        />
                        {stage ? (
                          <>
                            <input
                              type="hidden"
                              name="outcome"
                              value={stage.outcome}
                            />
                            <p className="text-xs text-muted-foreground">
                              Outcome: {stage.outcome}
                            </p>
                          </>
                        ) : (
                          <SelectField
                            label="Outcome"
                            name="outcome"
                            defaultValue="open"
                          >
                            {["open", "won", "lost", "disqualified"].map(
                              (o) => (
                                <option key={o} value={o}>
                                  {o === "won"
                                    ? "Converted (customer required)"
                                    : o}
                                </option>
                              ),
                            )}
                          </SelectField>
                        )}
                      </ActionForm>
                    </div>
                  </details>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Use Reorder stages below to set the sequence. Changes preserve
                every lead and its stage history.
              </p>
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Reorder stages
                </summary>
                <div className="mt-4">
                  <StageOrder
                    key={stages
                      .filter((s) => s.pipeline_id === pipeline.id)
                      .map((s) => s.id)
                      .join()}
                    tenantId={workspace.tenant.id}
                    pipelineId={pipeline.id}
                    stages={stages.filter((s) => s.pipeline_id === pipeline.id)}
                  />
                </div>
              </details>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
