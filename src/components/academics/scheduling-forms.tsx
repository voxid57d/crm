import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { TextArea } from "@/components/customers/fields";
import { AcademicIdentity } from "./forms";
import {
  saveSchedule,
  endSchedule,
  generateLessons,
  saveLesson,
  changeLessonStatus,
  rescheduleLesson,
} from "@/features/academics/scheduling-actions";
import {
  weekdays,
  type SchedulingOptions,
  type WeeklySlot,
  type Lesson,
  type LessonDetail,
} from "@/features/academics/scheduling-types";
import { localDateTime } from "@/lib/time.mjs";
import { addDays } from "@/features/academics/calendar.mjs";
const panel = "space-y-5 rounded-xl border bg-white p-5 sm:p-7";
export function ScheduleForm({
  tenantId,
  options,
  slot,
  today,
  zone,
}: {
  tenantId: string;
  options: SchedulingOptions;
  slot?: WeeklySlot;
  today: string;
  zone: string;
}) {
  const from =
      slot && slot.effective_from > today
        ? slot.effective_from
        : options.group.start_date > today
          ? options.group.start_date
          : today,
    to =
      slot?.effective_to ??
      (options.group.end_date && options.group.end_date < addDays(from, 90)
        ? options.group.end_date
        : addDays(from, 90));
  return (
    <ActionForm
      action={saveSchedule}
      submit={slot ? "Create schedule revision" : "Create weekly slot"}
      confirmation={
        slot
          ? "Create a new effective schedule revision? Existing lessons will remain unchanged."
          : undefined
      }
      className={panel}
    >
      <AcademicIdentity
        tenantId={tenantId}
        version={slot?.version}
        fields={{
          group_id: options.group.id,
          ...(slot ? { slot_id: slot.id } : {}),
        }}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Day of week"
          name="weekday"
          defaultValue={String(slot?.weekday ?? 1)}
        >
          {weekdays.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </SelectField>
        <Field
          label="Timezone (IANA name)"
          name="timezone"
          required
          maxLength={100}
          defaultValue={slot?.timezone ?? zone}
        />
        <Field
          label="Local start time"
          name="start_time"
          type="time"
          required
          defaultValue={slot?.start_time.slice(0, 5) ?? "14:00"}
        />
        <Field
          label="Local end time"
          name="end_time"
          type="time"
          required
          defaultValue={slot?.end_time.slice(0, 5) ?? "15:30"}
        />
        <Field
          label={slot ? "New period starts on" : "Effective start date"}
          name="effective_from"
          type="date"
          required
          defaultValue={from}
        />
        <Field
          label="Effective end date (maximum one year)"
          name="effective_to"
          type="date"
          required
          defaultValue={to}
        />
        <SelectField
          label="Assigned group teacher"
          name="teacher_id"
          required
          defaultValue={
            slot?.teacher_id ??
            options.group.teachers.find((t) => t.is_primary)?.employee_id
          }
        >
          <option value="">Choose an eligible assigned teacher</option>
          {slot && !options.teachers.some((t) => t.id === slot.teacher_id) && (
            <option value={slot.teacher_id}>
              {slot.teacher_name} (previous; review eligibility)
            </option>
          )}
          {options.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Classroom (optional)"
          name="classroom_id"
          defaultValue={slot?.classroom_id ?? options.group.classroom_id ?? ""}
        >
          <option value="">No physical classroom / online</option>
          {options.classrooms
            .filter((r) => r.is_active || r.id === slot?.classroom_id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.capacity} seats{r.is_active ? "" : " (inactive)"}
              </option>
            ))}
        </SelectField>
      </div>
      <Field
        label="Reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <p className="text-sm text-muted-foreground">
        Add a separate slot for each weekday/time. Local start must precede end
        on the same day. Weekly slots reserve group, teacher and room time
        before generation. A revision closes the old period and preserves every
        existing lesson; cancel or reschedule individual future lessons
        explicitly when needed.
      </p>
    </ActionForm>
  );
}
export function EndScheduleForm({
  tenantId,
  slot,
  today,
}: {
  tenantId: string;
  slot: WeeklySlot;
  today: string;
}) {
  return (
    <ActionForm
      action={endSchedule}
      submit="End weekly schedule"
      confirmation="End this weekly period? Existing lessons will remain unchanged and may need individual cancellation or rescheduling."
      className={panel}
    >
      <h2 className="text-lg font-semibold">End this period</h2>
      <AcademicIdentity
        tenantId={tenantId}
        version={slot.version}
        fields={{ slot_id: slot.id }}
      />
      <Field
        label="Stop from this local date"
        name="stop_from"
        type="date"
        required
        defaultValue={today}
      />
      <Field
        label="Reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <label className="flex items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-1" />I
        understand existing lessons are retained. This only stops ungenerated
        occurrences from the chosen date.
      </label>
    </ActionForm>
  );
}
export function GenerationForm({
  tenantId,
  groupId,
  from,
  to,
}: {
  tenantId: string;
  groupId: string;
  from: string;
  to: string;
}) {
  return (
    <ActionForm
      action={generateLessons}
      submit="Generate lessons"
      confirmation="Generate lessons for this local date range? Existing occurrences and their cancellations/reschedules will be retained."
      className={panel}
    >
      <h2 className="text-lg font-semibold">
        Generate lessons from weekly slots
      </h2>
      <AcademicIdentity tenantId={tenantId} fields={{ group_id: groupId }} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="From local date"
          name="from"
          type="date"
          required
          defaultValue={from}
        />
        <Field
          label="Through local date"
          name="to"
          type="date"
          required
          defaultValue={to}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Generate up to 31 days per request. Dates follow each slot&apos;s
        timezone. Past start times are skipped; existing occurrences are reused.
        A conflict rejects the whole batch, with no partial generation.
      </p>
    </ActionForm>
  );
}
export function LessonForm({
  tenantId,
  options,
  lesson,
  today,
  zone,
  reschedule = false,
}: {
  tenantId: string;
  options: SchedulingOptions;
  lesson?: Lesson;
  today: string;
  zone: string;
  reschedule?: boolean;
}) {
  const locked = Boolean(lesson && !reschedule),
    day =
      options.group.start_date > today
        ? options.group.start_date
        : addDays(today, 1),
    teacher =
      lesson?.teacher_id ??
      options.group.teachers.find((t) => t.is_primary)?.employee_id;
  return (
    <ActionForm
      action={reschedule ? rescheduleLesson : saveLesson}
      submit={
        reschedule
          ? "Reschedule lesson"
          : lesson
            ? "Save lesson details"
            : "Create lesson"
      }
      confirmation={
        reschedule
          ? "Reschedule this lesson? The original will remain as history and a linked replacement will be created."
          : undefined
      }
      className={panel}
    >
      <AcademicIdentity
        tenantId={tenantId}
        version={lesson?.version}
        fields={{
          group_id: options.group.id,
          ...(lesson ? { lesson_id: lesson.id } : {}),
        }}
      />
      <Field
        label="Lesson title / topic"
        name="title"
        required
        maxLength={200}
        defaultValue={lesson?.title}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Timezone (IANA name)"
          name="timezone"
          required
          readOnly={locked}
          maxLength={100}
          defaultValue={lesson?.timezone ?? zone}
        />
        <SelectField
          label="Assigned group teacher"
          name="teacher_id"
          required
          defaultValue={teacher}
        >
          <option value="">Choose an eligible assigned teacher</option>
          {lesson &&
            !options.teachers.some((t) => t.id === lesson.teacher_id) && (
              <option value={lesson.teacher_id}>
                {lesson.teacher_name} (previous; review eligibility)
              </option>
            )}
          {options.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Local start"
          name="local_start"
          type="datetime-local"
          required
          readOnly={locked}
          defaultValue={
            lesson
              ? localDateTime(lesson.starts_at, lesson.timezone)
              : day + "T14:00"
          }
        />
        <Field
          label="Local end"
          name="local_end"
          type="datetime-local"
          required
          readOnly={locked}
          defaultValue={
            lesson
              ? localDateTime(lesson.ends_at, lesson.timezone)
              : day + "T15:30"
          }
        />
        <SelectField
          label="Substitute teacher (optional)"
          name="substitute_id"
          defaultValue={lesson?.substitute_id ?? ""}
        >
          <option value="">Use the assigned group teacher</option>
          {lesson?.substitute_id &&
            !options.substitutes.some((t) => t.id === lesson.substitute_id) && (
              <option value={lesson.substitute_id}>
                {lesson.substitute_name} (previous; review eligibility)
              </option>
            )}
          {options.substitutes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Classroom (optional)"
          name="classroom_id"
          defaultValue={
            lesson?.classroom_id ?? options.group.classroom_id ?? ""
          }
        >
          <option value="">No physical classroom / online</option>
          {options.classrooms
            .filter((r) => r.is_active || r.id === lesson?.classroom_id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.capacity} seats{r.is_active ? "" : " (inactive)"}
              </option>
            ))}
        </SelectField>
      </div>
      <TextArea
        label="Lesson notes (optional)"
        name="notes"
        value={lesson?.notes ?? ""}
        maxLength={5000}
      />
      <Field
        label="Reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <p className="text-sm text-muted-foreground">
        {locked
          ? "Use Reschedule lesson to move time or change timezone. Only upcoming scheduled lesson details can be edited."
          : "Times use the selected timezone. Nonexistent or ambiguous daylight-saving times are rejected. Individual lessons can cross midnight, up to 24 hours."}{" "}
        A substitute occupies the teaching time instead of the original teacher.
        Historical entries require a reason and start as scheduled; completion
        is a separate action. No attendance or financial posting is created.
      </p>
    </ActionForm>
  );
}
export function LessonStatusForm({
  tenantId,
  detail,
}: {
  tenantId: string;
  detail: LessonDetail;
}) {
  const states = [
    ...(detail.can_start ? ["in_progress"] : []),
    ...(detail.can_complete ? ["completed"] : []),
    ...(detail.can_cancel ? ["cancelled"] : []),
  ];
  if (!states.length) return null;
  return (
    <ActionForm
      action={changeLessonStatus}
      submit="Change lesson status"
      confirmation="Change lesson status? History will be retained. Starting or completing saves the expected enrollment roster; this does not mark attendance."
      className={panel}
    >
      <h2 className="text-lg font-semibold">Lesson lifecycle</h2>
      <AcademicIdentity
        tenantId={tenantId}
        version={detail.lesson.version}
        fields={{ lesson_id: detail.lesson.id }}
      />
      <SelectField label="New status" name="status">
        {states.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </SelectField>
      <Field
        label="Reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <label className="flex items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-1" />I
        confirm this lesson change and understand completed records cannot be
        edited.
      </label>
    </ActionForm>
  );
}
