import { AcademicIdentity } from "./forms";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import {
  saveClosure,
  saveOccurrenceException,
} from "@/features/academics/calendar-actions";
import type {
  Closure,
  ScheduleException,
} from "@/features/academics/calendar-types";
import type { SlotRow } from "@/features/academics/scheduling-types";
import { weekdays } from "@/features/academics/scheduling-types";
import type { getWorkspace } from "@/features/workspace/context";
export function ClosureForm({
  workspace: w,
  closure: c,
  today,
}: {
  workspace: Awaited<ReturnType<typeof getWorkspace>>;
  closure?: Closure;
  today: string;
}) {
  return (
    <ActionForm
      action={saveClosure}
      submit={c ? "Save non-teaching date" : "Create non-teaching date"}
      className="space-y-5 rounded-xl border bg-white p-5"
    >
      <AcademicIdentity
        tenantId={w.tenant.id}
        version={c?.version ?? 0}
        fields={{ id: c?.id ?? "" }}
      />
      {c ? (
        <>
          <input type="hidden" name="branch_id" value={c.branch_id ?? ""} />
          <p className="text-sm">
            Scope: {c.branch_name ?? "Whole business"} · Retained timezone:{" "}
            {c.timezone}
          </p>
        </>
      ) : (
        <SelectField
          label="Closure scope"
          name="branch_id"
          required={!w.businessPermissions.has("schedules.manage_holidays")}
        >
          {w.businessPermissions.has("schedules.manage_holidays") && (
            <option value="">Whole business</option>
          )}
          {w.branches
            .filter(
              (b) =>
                b.is_active &&
                w.branchPermissions.get(b.id)?.has("schedules.manage_holidays"),
            )
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
      )}
      <Field
        label="Name"
        name="name"
        required
        maxLength={150}
        defaultValue={c?.name ?? ""}
      />
      <Field
        label="Calendar reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
        defaultValue={c?.reason ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="From date"
          name="from_date"
          type="date"
          required
          defaultValue={c?.from_date ?? today}
        />
        <Field
          label="Through date"
          name="to_date"
          type="date"
          required
          defaultValue={c?.to_date ?? today}
        />
      </div>
      <SelectField
        label="Enabled state"
        name="is_active"
        defaultValue={String(c?.is_active ?? true)}
      >
        <option value="true">Active non-teaching period</option>
        <option value="false">Inactive / retired</option>
      </SelectField>
      <p className="text-sm text-muted-foreground">
        Dates cover whole local days in {c?.timezone ?? w.tenant.timezone}.
        Existing lessons are retained for explicit review. New and moved
        bookings cannot overlap active closures. Reopening a date rechecks
        restored weekly reservations.
      </p>
    </ActionForm>
  );
}
export function ExceptionForm({
  tenant,
  group,
  slots,
  exception: e,
  date,
}: {
  tenant: string;
  group: string;
  slots: SlotRow[];
  exception?: ScheduleException;
  date: string;
}) {
  const bySeries = new Map<string, SlotRow>();
  for (const s of slots)
    if (!bySeries.has(s.series_id)) bySeries.set(s.series_id, s);
  const series = [...bySeries.values()];
  return (
    <ActionForm
      action={saveOccurrenceException}
      submit={e ? "Update occurrence exception" : "Skip weekly occurrence"}
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <AcademicIdentity
        tenantId={tenant}
        version={e?.version ?? 0}
        fields={{ id: e?.id ?? "", group_id: group }}
      />
      {e ? (
        <>
          <input type="hidden" name="series_id" value={e.series_id} />
          <input
            type="hidden"
            name="occurrence_date"
            value={e.occurrence_date}
          />
          <p className="text-sm">Weekly occurrence: {e.occurrence_date}</p>
        </>
      ) : (
        <>
          <SelectField
            label="Weekly series (latest period shown)"
            name="series_id"
            required
          >
            {series.map((s) => (
              <option key={s.series_id} value={s.series_id}>
                {weekdays[s.weekday - 1]} · {s.start_time}–{s.end_time} ·{" "}
                {s.timezone} · {s.effective_from} → {s.effective_to}
              </option>
            ))}
          </SelectField>
          <Field
            label="Occurrence local date"
            name="occurrence_date"
            type="date"
            required
            defaultValue={date}
          />
        </>
      )}
      <Field
        label="Occurrence reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
        defaultValue={e?.reason ?? ""}
      />
      <SelectField
        label="Exception state"
        name="is_active"
        defaultValue={String(e?.is_active ?? true)}
      >
        <option value="true">Skip this weekly occurrence</option>
        <option value="false">Use the normal weekly plan</option>
      </SelectField>
      <p className="text-sm text-muted-foreground">
        Affects one series/date only. Already generated lessons remain
        unchanged; review their details to cancel or reschedule. Disabling an
        exception never resurrects a cancelled or rescheduled original.
      </p>
    </ActionForm>
  );
}
