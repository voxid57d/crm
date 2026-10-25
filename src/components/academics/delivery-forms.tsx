import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { TextArea } from "@/components/customers/fields";
import { AcademicIdentity } from "./forms";
import {
  saveGroup,
  changeGroupStatus,
  saveTeachers,
  createEnrollment,
  updateEnrollment,
  transferEnrollment,
} from "@/features/academics/group-actions";
import { pricingModels } from "@/features/academics/types";
import type {
  LmsOptions,
  StudyGroup,
  TeacherChoice,
  Enrollment,
  StudentChoice,
  GroupRow,
} from "@/features/academics/group-types";
const panel = "space-y-5 rounded-xl border bg-white p-5 sm:p-7";
export function GroupForm({
  tenantId,
  branchId,
  branchName,
  options,
  group,
  today,
  courseId,
}: {
  tenantId: string;
  branchId: string;
  branchName: string;
  options: LmsOptions;
  group?: StudyGroup;
  today: string;
  courseId?: string;
}) {
  return (
    <ActionForm
      action={saveGroup}
      submit={group ? "Save group" : "Create group"}
      className={panel}
    >
      <AcademicIdentity
        tenantId={tenantId}
        version={group?.version}
        fields={{
          branch_id: branchId,
          ...(group ? { group_id: group.id, course_id: group.course_id } : {}),
        }}
      />
      <p className="text-sm text-muted-foreground">
        Branch: {branchName}. Group branch and course stay fixed after creation.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Group name"
          name="name"
          required
          maxLength={150}
          defaultValue={group?.name}
        />
        <Field
          label="Group code (optional)"
          name="code"
          maxLength={40}
          defaultValue={group?.code ?? ""}
        />
        {group ? (
          <p className="text-sm">Course: {group.course_name}</p>
        ) : (
          <SelectField
            name="course_id"
            label="Course"
            required
            defaultValue={courseId}
          >
            <option value="">Choose an active course</option>
            {options.courses
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectField>
        )}
        <Field
          label="Maximum students"
          name="capacity"
          type="number"
          min={1}
          max={10000}
          required
          defaultValue={group?.capacity}
        />
        <Field
          label="Start date"
          name="start_date"
          type="date"
          required
          defaultValue={group?.start_date ?? today}
        />
        <Field
          label="End date (optional)"
          name="end_date"
          type="date"
          defaultValue={group?.end_date ?? ""}
        />
        <SelectField
          label="Default classroom (optional)"
          name="classroom_id"
          defaultValue={group?.classroom_id ?? ""}
        >
          <option value="">No physical classroom / online</option>
          {options.classrooms
            .filter(
              (r) =>
                r.branch_id === branchId &&
                (r.is_active || r.id === group?.classroom_id),
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — capacity {r.capacity}
                {r.is_active ? "" : " (inactive; retained)"}
              </option>
            ))}
        </SelectField>
      </div>
      <p className="text-sm text-muted-foreground">
        Pending, active and paused enrollments reserve seats. Classroom capacity
        must cover the group. Weekly schedules and lesson conflicts will be
        added in Step 7C.
      </p>
    </ActionForm>
  );
}
export function GroupStatusForm({
  tenantId,
  group,
  canArchive,
  canUpdate,
}: {
  tenantId: string;
  group: StudyGroup;
  canArchive: boolean;
  canUpdate: boolean;
}) {
  const next = !canUpdate
    ? ["completed", "cancelled"].includes(group.status) && canArchive
      ? ["archived"]
      : []
    : group.status === "planned"
      ? ["active", "cancelled"]
      : group.status === "active"
        ? ["paused", "completed", "cancelled"]
        : group.status === "paused"
          ? ["active", "completed", "cancelled"]
          : ["completed", "cancelled"].includes(group.status) && canArchive
            ? ["archived"]
            : [];
  if (!next.length) return null;
  return (
    <ActionForm
      action={changeGroupStatus}
      submit="Change group status"
      confirmation="Change this group's status? History and financial records will be retained."
      className={panel}
    >
      <h2 className="text-lg font-semibold">Group status</h2>
      <AcademicIdentity
        tenantId={tenantId}
        version={group.version}
        fields={{ group_id: group.id }}
      />
      <SelectField label="New status" name="status">
        {next.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectField>
      <Field
        name="reason"
        label="Reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="confirm" required />I confirm this change.
        Close all reserved enrollments before completing or cancelling the
        group.
      </label>
    </ActionForm>
  );
}
export function TeachersForm({
  tenantId,
  group,
  choices,
}: {
  tenantId: string;
  group: StudyGroup;
  choices: TeacherChoice[];
}) {
  const all = [
    ...new Map(
      [
        ...group.teachers.map((t) => ({ id: t.employee_id, name: t.name })),
        ...choices,
      ].map((t) => [t.id, t]),
    ).values(),
  ];
  return (
    <ActionForm
      action={saveTeachers}
      submit="Save teacher assignments"
      confirmation="Save teacher assignments? Previous assignments will remain in history."
      className={panel}
    >
      <AcademicIdentity
        tenantId={tenantId}
        version={group.version}
        fields={{ group_id: group.id }}
      />
      <fieldset className="space-y-3">
        <legend className="mb-3 font-medium">Assigned teachers</legend>
        {all.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="employee_ids"
              value={t.id}
              defaultChecked={group.teachers.some(
                (a) => a.employee_id === t.id,
              )}
            />
            {t.name}
          </label>
        ))}
        {!all.length && (
          <p className="text-sm text-muted-foreground">
            No eligible teachers match. Create an employee, assign the branch,
            and link their login with teaching permission through the existing
            invitation flow.
          </p>
        )}
      </fieldset>
      <SelectField
        label="Primary teacher"
        name="primary_id"
        defaultValue={
          group.teachers.find((t) => t.is_primary)?.employee_id ?? ""
        }
      >
        <option value="">No primary (only when no teachers selected)</option>
        {all.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>
      <Field
        label="Assignment reason (optional)"
        name="reason"
        maxLength={1000}
      />
      <p className="text-sm text-muted-foreground">
        Choose exactly one primary from the selected teachers. Existing
        selections are retained alongside search results. Inactive or
        no-longer-authorized teachers must be removed before saving.
      </p>
    </ActionForm>
  );
}
function AgreementFields({
  price,
  model,
  today,
  start,
  status = "pending",
  transfer = false,
}: {
  price: string;
  model: string;
  today: string;
  start: string;
  status?: string;
  transfer?: boolean;
}) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Agreed price (UZS)"
          name="agreed_price"
          required
          inputMode="decimal"
          maxLength={19}
          defaultValue={price}
        />
        <SelectField
          label="Agreed pricing model"
          name="pricing_model"
          defaultValue={model}
        >
          {Object.entries(pricingModels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        {!transfer && (
          <>
            <Field
              label="Enrollment date"
              name="enrollment_date"
              type="date"
              required
              defaultValue={today}
            />
            <Field
              label="Effective start date"
              name="effective_start_date"
              type="date"
              required
              defaultValue={start}
            />
          </>
        )}
        <Field
          label="Effective end date (optional)"
          name="effective_end_date"
          type="date"
        />
        <SelectField
          label="Enrollment status"
          name="status"
          defaultValue={status}
        >
          <option value="pending">Pending</option>
          <option value="active">Active (requires active group)</option>
        </SelectField>
      </div>
      <TextArea
        name="notes"
        label="Academic administration notes (optional)"
        value=""
        maxLength={3000}
      />
      <p className="text-sm text-muted-foreground">
        This is an enrollment agreement, not an invoice. Its exact
        price/model/currency are retained. Do not put salary, debt or other
        sensitive financial details in notes.
      </p>
    </>
  );
}
function AddBranch() {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="add_branch" className="mt-1" />
      If needed, explicitly add this student&apos;s group branch. This requires
      CRM update access across all existing branches and the new branch.
      Existing branch links are retained.
    </label>
  );
}
export function EnrollmentForm({
  tenantId,
  group,
  students,
  selected,
  today,
  price,
  model,
}: {
  tenantId: string;
  group: StudyGroup;
  students: StudentChoice[];
  selected?: string;
  today: string;
  price: string;
  model: string;
}) {
  return (
    <ActionForm
      action={createEnrollment}
      submit="Enroll student"
      className={panel}
    >
      <AcademicIdentity tenantId={tenantId} fields={{ group_id: group.id }} />
      <SelectField
        label="Existing student"
        name="student_id"
        required
        defaultValue={selected}
      >
        <option value="">Choose a student from search results</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.student_identifier}
            {s.has_branch ? "" : " (branch addition required)"}
          </option>
        ))}
      </SelectField>
      <AgreementFields
        price={price}
        model={model}
        today={today}
        start={group.start_date > today ? group.start_date : today}
        status={group.status === "active" ? "active" : "pending"}
      />
      <AddBranch />
    </ActionForm>
  );
}
export function EnrollmentUpdateForm({
  tenantId,
  enrollment: e,
  canWithdraw,
}: {
  tenantId: string;
  enrollment: Enrollment;
  canWithdraw: boolean;
}) {
  const next =
    e.status === "pending"
      ? [
          "pending",
          "active",
          ...(canWithdraw ? ["cancelled", "withdrawn"] : []),
        ]
      : e.status === "active"
        ? [
            "active",
            "paused",
            "completed",
            ...(canWithdraw ? ["withdrawn"] : []),
          ]
        : e.status === "paused"
          ? [
              "paused",
              "active",
              "completed",
              ...(canWithdraw ? ["withdrawn"] : []),
            ]
          : [];
  if (!next.length) return null;
  return (
    <ActionForm
      action={updateEnrollment}
      submit="Save enrollment status"
      confirmation="Save enrollment changes? The original agreement and financial history remain unchanged."
      className={panel}
    >
      <h2 className="text-lg font-semibold">Academic details and status</h2>
      <AcademicIdentity
        tenantId={tenantId}
        version={e.version}
        fields={{ enrollment_id: e.id }}
      />
      <SelectField label="Status" name="status" defaultValue={e.status}>
        {next.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectField>
      <Field
        label="Effective start date"
        name="effective_start_date"
        type="date"
        required
        defaultValue={e.effective_start_date}
        readOnly={e.status !== "pending"}
      />
      <Field
        label="Effective end date"
        name="effective_end_date"
        type="date"
        defaultValue={e.effective_end_date ?? ""}
      />
      <TextArea
        label="Academic administration notes"
        name="notes"
        value={e.notes ?? ""}
        maxLength={3000}
      />
      <Field
        label="Reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <p className="text-sm text-muted-foreground">
        Paused enrollments retain their seats. Completed/withdrawn enrollments
        need an effective end date no later than today. Terminal records cannot
        be edited; pending future enrollments can be cancelled.
      </p>
    </ActionForm>
  );
}
export function TransferForm({
  tenantId,
  enrollment: e,
  targets,
  today,
}: {
  tenantId: string;
  enrollment: Enrollment;
  targets: GroupRow[];
  today: string;
}) {
  return (
    <ActionForm
      action={transferEnrollment}
      submit="Transfer student"
      confirmation="Transfer this student? This closes the source enrollment and creates a linked destination agreement without moving financial records."
      className={panel}
    >
      <AcademicIdentity
        tenantId={tenantId}
        version={e.version}
        fields={{ enrollment_id: e.id }}
      />
      <SelectField label="Destination group" name="target_id" required>
        <option value="">Choose an authorized destination</option>
        {targets
          .filter(
            (g) =>
              g.id !== e.group_id && ["planned", "active"].includes(g.status),
          )
          .map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {g.branch_name} · {g.reserved_seats}/{g.capacity} seats
            </option>
          ))}
      </SelectField>
      <Field
        name="transfer_date"
        label="Transfer effective date"
        type="date"
        required
        defaultValue={today}
      />
      <AgreementFields
        price={e.agreed_price ?? ""}
        model={e.pricing_model ?? "monthly"}
        today={today}
        start={today}
        transfer
      />
      <Field
        label="Transfer reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <AddBranch />
      <p className="text-sm text-muted-foreground">
        The transfer date sets the new enrollment&apos;s start date and the old
        enrollment&apos;s end date. The new enrollment date is today. Review the
        destination price and status; transfer is immediate and cannot be
        future-dated. Original agreements, branch links and all
        invoices/payments remain attached to their original identities.
      </p>
    </ActionForm>
  );
}
