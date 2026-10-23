import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { salesOptions } from "@/features/sales/queries";
export function SalesFilters({
  options,
  filters,
  followups = false,
  board = false,
  analytics = false,
}: {
  options: Awaited<ReturnType<typeof salesOptions>>;
  filters: Record<string, string>;
  followups?: boolean;
  board?: boolean;
  analytics?: boolean;
}) {
  const { workspace, pipelines, stages, sources, employeeChoices } = options;
  const employees = Array.from(
    new Map(
      Object.values(employeeChoices)
        .flat()
        .map((e) => [e.id, e]),
    ).values(),
  );
  return (
    <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      {!followups && (
        <Field
          label="Search name, phone or email"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
        />
      )}
      <SelectField
        label="Branch"
        name="branch"
        defaultValue={filters.branch ?? "all"}
      >
        <option value="all">All authorized branches</option>
        {workspace.branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectField>
      {!followups && (
        <SelectField
          label="Pipeline"
          name="pipeline"
          defaultValue={filters.pipeline ?? ""}
        >
          {!board && <option value="">All pipelines</option>}
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField
        label="Employee"
        name="employee"
        defaultValue={filters.employee ?? ""}
      >
        <option value="">All employees</option>
        {!followups && <option value="unassigned">Unassigned</option>}
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.full_name}
          </option>
        ))}
      </SelectField>
      {followups ? (
        <SelectField
          label="Follow-up status"
          name="state"
          defaultValue={filters.state ?? "pending"}
        >
          {["pending", "overdue", "completed", "all"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
      ) : (
        <>
          <SelectField
            label="Priority"
            name="priority"
            defaultValue={filters.priority ?? ""}
          >
            <option value="">All priorities</option>
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Source"
            name="source"
            defaultValue={filters.source ?? ""}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          {!analytics && (
            <SelectField
              label="Records"
              name="archived"
              defaultValue={filters.archived ?? "false"}
            >
              <option value="false">Current leads</option>
              <option value="true">Archived leads</option>
            </SelectField>
          )}
        </>
      )}
      <Field
        label={followups ? "Scheduled from" : "Lead created from"}
        name="from"
        type="date"
        defaultValue={filters.from}
      />
      <Field
        label="Through date (inclusive)"
        name="until"
        type="date"
        defaultValue={filters.until}
      />
      {!followups && (
        <SelectField
          label="Stage"
          name="stage"
          defaultValue={filters.stage ?? ""}
        >
          <option value="">All stages</option>
          {stages
            .filter(
              (s) => !filters.pipeline || s.pipeline_id === filters.pipeline,
            )
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_active ? "" : " (inactive)"}
              </option>
            ))}
        </SelectField>
      )}
      <Button>Apply filters</Button>
      <a
        href="?branch=all"
        className="text-sm font-medium text-primary underline"
      >
        Reset filters
      </a>
    </form>
  );
}
