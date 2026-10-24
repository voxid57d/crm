"use client";
import { useState } from "react";
import { Field, SelectField } from "@/components/forms/field";
import type { Student } from "@/features/customers/types";

export function StudentFields({
  student,
  requiredStudent = false,
}: {
  student: Student | null;
  requiredStudent?: boolean;
}) {
  const [enabled, setEnabled] = useState(requiredStudent || Boolean(student));
  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">
        {requiredStudent ? "Student details" : "Education profile (optional)"}
      </legend>
      {student || requiredStudent ? (
        <>
          <input type="hidden" name="student_enabled" value="on" />
          <p className="text-sm text-muted-foreground">
            {requiredStudent
              ? "Save student and contact details together. A student profile does not create a course enrollment."
              : "Student profile linked to this contact. Change education status to retain its history when studies end."}
          </p>
        </>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="student_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 accent-primary"
          />
          This customer is a student
        </label>
      )}
      {enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={
              requiredStudent && !student
                ? "Student identifier (optional; generated when blank)"
                : "Student identifier"
            }
            name="student_identifier"
            required={!requiredStudent}
            maxLength={80}
            defaultValue={student?.student_identifier}
          />
          <SelectField
            label={requiredStudent ? "Student status" : "Education status"}
            name="education_status"
            defaultValue={student?.education_status ?? "active"}
          >
            {["prospective", "active", "on_hold", "completed", "withdrawn"].map(
              (s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ),
            )}
          </SelectField>
          <Field
            label="School / university (optional)"
            name="school"
            maxLength={200}
            defaultValue={student?.school ?? ""}
          />
          <Field
            label="Education level (optional)"
            name="education_level"
            maxLength={150}
            defaultValue={student?.education_level ?? ""}
          />
          <Field
            label={
              requiredStudent
                ? "Student start date (optional)"
                : "Enrollment date (optional)"
            }
            name="enrollment_date"
            type="date"
            defaultValue={student?.enrollment_date ?? ""}
          />
          <label className="block text-sm font-medium sm:col-span-2">
            Learning goals (optional)
            <textarea
              name="learning_goals"
              defaultValue={student?.learning_goals ?? ""}
              maxLength={2000}
              rows={3}
              className="mt-1.5 w-full rounded-lg border p-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Additional education information (optional)
            <textarea
              name="additional_information"
              defaultValue={student?.additional_information ?? ""}
              maxLength={3000}
              rows={3}
              className="mt-1.5 w-full rounded-lg border p-3 text-sm"
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
