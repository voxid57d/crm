import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { TextArea } from "@/components/customers/fields";
import {
  saveCourse,
  saveClassroom,
  setAcademicActive,
  saveCourseSetting,
} from "@/features/academics/actions";
import { canManageCourses, canClassroom } from "@/features/academics/queries";
import type { getWorkspace } from "@/features/workspace/context";
import {
  pricingModels,
  durationUnits,
  type Course,
  type Classroom,
  type CatalogOptions,
  type CatalogSetting,
  type AcademicKind,
} from "@/features/academics/types";
type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export function AcademicIdentity({
  tenantId,
  version = 0,
  fields = {},
}: {
  tenantId: string;
  version?: number;
  fields?: Record<string, string>;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      <input type="hidden" name="version" value={version} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
export function CourseForm({
  workspace: w,
  options,
  course,
}: {
  workspace: Workspace;
  options: CatalogOptions;
  course?: Course;
}) {
  if (!canManageCourses(w))
    return (
      <p role="alert">
        Business-wide course viewing and management permission is required.
      </p>
    );
  return (
    <ActionForm
      action={saveCourse}
      submit={course ? "Save course" : "Create course"}
      className="space-y-5 rounded-xl border bg-white p-5 sm:p-7"
    >
      <AcademicIdentity
        tenantId={w.tenant.id}
        version={course?.version}
        fields={course ? { course_id: course.id } : {}}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Course name"
          name="name"
          required
          maxLength={150}
          defaultValue={course?.name}
        />
        <Field
          label="Course code (optional)"
          name="code"
          maxLength={40}
          defaultValue={course?.code ?? ""}
        />
        <SelectField
          label="Category (optional)"
          name="category_id"
          defaultValue={course?.category_id ?? ""}
        >
          <option value="">Uncategorized</option>
          {options.categories
            .filter((c) => c.is_active || c.id === course?.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? "" : " (inactive; retained)"}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Level (optional)"
          name="level_id"
          defaultValue={course?.level_id ?? ""}
        >
          <option value="">Not set</option>
          {options.levels
            .filter((l) => l.is_active || l.id === course?.level_id)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.is_active ? "" : " (inactive; retained)"}
              </option>
            ))}
        </SelectField>
        <Field
          label="Default duration (optional)"
          name="duration_value"
          type="number"
          min={1}
          max={10000}
          step={1}
          defaultValue={course?.duration_value ?? ""}
        />
        <SelectField
          label="Duration unit"
          name="duration_unit"
          defaultValue={course?.duration_unit ?? "weeks"}
        >
          {Object.entries(durationUnits).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <Field
          label="Default lesson duration in minutes (optional)"
          name="lesson_duration_minutes"
          type="number"
          min={1}
          max={1440}
          step={1}
          defaultValue={course?.lesson_duration_minutes ?? ""}
        />
        <Field
          label="Standard price (UZS)"
          name="standard_price"
          inputMode="decimal"
          maxLength={19}
          required
          defaultValue={course?.standard_price ?? "0.00"}
        />
        <SelectField
          label="Pricing model"
          name="pricing_model"
          defaultValue={course?.pricing_model ?? "monthly"}
        >
          {Object.entries(pricingModels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      <TextArea
        label="Course description (optional)"
        name="description"
        value={course?.description ?? ""}
        maxLength={6000}
      />
      <p className="text-sm text-muted-foreground">
        Currency: UZS. A zero price is allowed. This is a catalog template;
        saving it creates no enrollment, invoice or payment. Future agreements
        and posted invoices keep their own prices.
      </p>
    </ActionForm>
  );
}
export function ClassroomForm({
  workspace: w,
  classroom,
}: {
  workspace: Workspace;
  classroom?: Classroom;
}) {
  const branches = w.branches.filter(
    (b) => b.is_active && canClassroom(w, "classrooms.manage", b.id),
  );
  if (
    classroom
      ? !canClassroom(w, "classrooms.manage", classroom.branch_id)
      : !branches.length
  )
    return (
      <p role="alert">No authorized branch allows classroom management.</p>
    );
  return (
    <ActionForm
      action={saveClassroom}
      submit={classroom ? "Save classroom" : "Create classroom"}
      className="space-y-5 rounded-xl border bg-white p-5 sm:p-7"
    >
      <AcademicIdentity
        tenantId={w.tenant.id}
        version={classroom?.version}
        fields={
          classroom
            ? { classroom_id: classroom.id, branch_id: classroom.branch_id }
            : {}
        }
      />
      {classroom ? (
        <p className="text-sm text-muted-foreground">
          Branch: {classroom.branch_name}. Classroom branch cannot be changed.
        </p>
      ) : (
        <SelectField
          label="Branch"
          name="branch_id"
          required
          defaultValue={
            branches.some((b) => b.id === w.branch?.id)
              ? w.branch?.id
              : branches[0]?.id
          }
        >
          {branches.map((b) => (
            <option value={b.id} key={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Classroom name or number"
          name="name"
          required
          maxLength={100}
          defaultValue={classroom?.name}
        />
        <Field
          label="Capacity"
          name="capacity"
          type="number"
          min={1}
          max={10000}
          step={1}
          required
          defaultValue={classroom?.capacity}
        />
      </div>
      <TextArea
        label="Description (optional)"
        name="description"
        value={classroom?.description ?? ""}
        maxLength={2000}
      />
      <p className="text-sm text-muted-foreground">
        This is a physical branch resource. Online instruction will not require
        a classroom. Lesson schedules and occupancy are added in a later
        increment.
      </p>
    </ActionForm>
  );
}
export function AcademicStateForm({
  tenantId,
  kind,
  id,
  version,
  active,
}: {
  tenantId: string;
  kind: AcademicKind;
  id: string;
  version: number;
  active: boolean;
}) {
  const label = active
    ? kind === "course"
      ? "Archive course"
      : "Deactivate classroom"
    : kind === "course"
      ? "Reactivate course"
      : "Reactivate classroom";
  return (
    <ActionForm
      action={setAcademicActive}
      submit={label}
      confirmation={`${label}? The record and its history will be retained.`}
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <h2 className="text-lg font-semibold">{label}</h2>
      <AcademicIdentity
        tenantId={tenantId}
        version={version}
        fields={{ kind, resource_id: id, is_active: String(!active) }}
      />
      <Field label="Reason (optional)" name="reason" maxLength={1000} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirm"
          required
          className="mt-1 size-4 accent-primary"
        />
        I confirm this status change. Existing references and history will be
        retained.
      </label>
    </ActionForm>
  );
}
export function CourseSettingForm({
  tenantId,
  kind,
  setting,
}: {
  tenantId: string;
  kind: "category" | "level";
  setting?: CatalogSetting;
}) {
  return (
    <ActionForm
      action={saveCourseSetting}
      submit={
        setting
          ? "Save setting"
          : kind === "category"
            ? "Create category"
            : "Create level"
      }
      confirmation={
        setting
          ? "Save this setting? Existing course references are retained when it is deactivated."
          : undefined
      }
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <AcademicIdentity
        tenantId={tenantId}
        version={setting?.version}
        fields={{ kind, ...(setting ? { setting_id: setting.id } : {}) }}
      />
      <Field
        label={kind === "category" ? "Category name" : "Level name"}
        name="name"
        defaultValue={setting?.name}
        required
        maxLength={100}
      />
      <SelectField
        label="Status"
        name="is_active"
        defaultValue={String(setting?.is_active ?? true)}
      >
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </SelectField>
    </ActionForm>
  );
}
