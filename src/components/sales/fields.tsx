"use client";
import { useState } from "react";
import { Field, SelectField } from "@/components/forms/field";
import type { Lead, Pipeline, Stage, Followup } from "@/features/sales/types";
import { localDateTime } from "@/features/sales/time.mjs";
export function SalesIdentity({
  tenantId,
  leadId,
}: {
  tenantId: string;
  leadId?: string;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}
    </>
  );
}
export function LeadFields({
  tenantId,
  lead,
  branches,
  pipelines,
  stages,
  sources,
  employeeChoices,
  defaultBranch,
  canAssign,
}: {
  tenantId: string;
  lead?: Lead;
  branches: { id: string; name: string }[];
  pipelines: Pipeline[];
  stages: Stage[];
  sources: { id: string; name: string; is_active: boolean }[];
  employeeChoices: Record<string, { id: string; full_name: string }[]>;
  defaultBranch?: string;
  canAssign: boolean;
}) {
  const [branch, setBranch] = useState(
    lead?.branch_id ?? defaultBranch ?? branches[0]?.id ?? "",
  );
  const [pipeline, setPipeline] = useState(
    lead?.pipeline_id ??
      pipelines.find((p) => p.is_default)?.id ??
      pipelines[0]?.id ??
      "",
  );
  return (
    <>
      <SalesIdentity tenantId={tenantId} leadId={lead?.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          name="first_name"
          required
          maxLength={100}
          defaultValue={lead?.first_name}
        />
        <Field
          label="Last name (optional)"
          name="last_name"
          maxLength={100}
          defaultValue={lead?.last_name}
        />
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          required
          minLength={3}
          maxLength={40}
          defaultValue={lead?.phone}
        />
        <Field
          label="Secondary phone (optional)"
          name="secondary_phone"
          type="tel"
          maxLength={40}
          defaultValue={lead?.secondary_phone ?? ""}
        />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          maxLength={254}
          defaultValue={lead?.email ?? ""}
        />
        <Field
          label="Interested service / course (optional)"
          name="interested_service"
          maxLength={300}
          defaultValue={lead?.interested_service ?? ""}
        />
        <SelectField
          label="Branch"
          name="branch_id"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          required
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Priority"
          name="priority"
          defaultValue={lead?.priority ?? "normal"}
        >
          {["low", "normal", "high", "urgent"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Lead source (optional)"
          name="source_id"
          defaultValue={lead?.source_id ?? ""}
        >
          <option value="">Unspecified</option>
          {sources
            .filter((s) => s.is_active || s.id === lead?.source_id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_active ? "" : " (inactive)"}
              </option>
            ))}
        </SelectField>
        {canAssign ? (
          <SelectField
            key={branch}
            label="Assigned sales employee"
            name="assigned_employee_id"
            defaultValue={
              lead?.branch_id === branch
                ? (lead.assigned_employee_id ?? "")
                : ""
            }
          >
            <option value="">Unassigned</option>
            {(employeeChoices[branch] ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
            {lead?.assigned_employee_id &&
              !employeeChoices[branch]?.some(
                (e) => e.id === lead.assigned_employee_id,
              ) &&
              lead.branch_id === branch && (
                <option value={lead.assigned_employee_id}>
                  Previous employee (currently unavailable)
                </option>
              )}
          </SelectField>
        ) : (
          <>
            <input
              type="hidden"
              name="assigned_employee_id"
              value={lead?.assigned_employee_id ?? ""}
            />
            <p className="text-sm text-muted-foreground">
              Your role cannot reassign sales employees.
            </p>
          </>
        )}
        {lead ? (
          <>
            <input type="hidden" name="pipeline_id" value={lead.pipeline_id} />
            <input type="hidden" name="stage_id" value={lead.stage_id} />
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Change pipeline/stage from the profile or Kanban board so every
              transition is recorded.
            </p>
          </>
        ) : (
          <>
            <SelectField
              label="Pipeline"
              name="pipeline_id"
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              required
            >
              {pipelines
                .filter((p) => p.is_active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              key={pipeline}
              label="Initial stage"
              name="stage_id"
              required
            >
              {stages
                .filter(
                  (s) =>
                    s.pipeline_id === pipeline &&
                    s.is_active &&
                    s.outcome === "open",
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </SelectField>
          </>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Only active, CRM-linked employees with sales permissions in this branch
        can be assigned. Shared phone numbers are allowed; duplicates are never
        merged automatically. Add internal notes after saving.
      </p>
    </>
  );
}
export function FollowupFields({
  tenantId,
  leadId,
  employees,
  timezone,
  followup,
}: {
  tenantId: string;
  leadId: string;
  employees: { id: string; full_name: string }[];
  timezone: string;
  followup?: Followup;
}) {
  return (
    <>
      <SalesIdentity tenantId={tenantId} leadId={leadId} />
      {followup && (
        <input type="hidden" name="followup_id" value={followup.id} />
      )}
      <SelectField
        label="Responsible sales employee"
        name="responsible_employee_id"
        required
        defaultValue={followup?.responsible_employee_id}
      >
        <option value="">Choose an employee</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.full_name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Activity type"
        name="kind"
        defaultValue={followup?.kind ?? "phone_call"}
      >
        {["phone_call", "meeting", "message", "trial_lesson", "follow_up"].map(
          (k) => (
            <option key={k} value={k}>
              {k.replaceAll("_", " ")}
            </option>
          ),
        )}
      </SelectField>
      <Field
        label={`Scheduled time (${timezone})`}
        name="scheduled_local"
        type="datetime-local"
        required
        defaultValue={
          followup ? localDateTime(followup.scheduled_at, timezone) : ""
        }
      />
      <label className="block text-sm font-medium">
        Description
        <textarea
          name="description"
          required
          maxLength={2000}
          rows={3}
          defaultValue={followup?.description}
          className="mt-1.5 w-full rounded-lg border p-3 text-sm"
        />
      </label>
    </>
  );
}
