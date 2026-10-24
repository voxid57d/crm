import { text, email, uuid, InputError } from "@/lib/validation.mjs";
import type { customerOptions } from "./queries";
export function contactDate(form: FormData, name: string) {
  const value = text(form, name, { max: 10, label: name.replaceAll("_", " ") });
  if (
    value &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    throw new InputError("Enter a valid calendar date.");
  return value;
}
export function parseCustomerForm(
  form: FormData,
  options: Awaited<ReturnType<typeof customerOptions>>,
  forceStudent = false,
) {
  const fields: Record<string, string> = {};
  for (const field of options.fields.filter((f) => f.is_active))
    fields[field.id] = text(form, `field_${field.id}`, {
      max: 2000,
      label: field.name,
    });
  const responsible = text(form, "responsible_employee_id"),
    status = text(form, "status_id");
  return {
    p_branches: form.getAll("branch_ids").map(uuid),
    p_tags: form.getAll("tag_ids").map(uuid),
    p_fields: fields,
    p_student:
      forceStudent || form.get("student_enabled") === "on"
        ? {
            student_identifier: text(form, "student_identifier", {
              min: forceStudent ? 0 : 1,
              max: 80,
              label: "Student identifier",
            }),
            education_status: text(form, "education_status") || "active",
            school: text(form, "school", { max: 200 }),
            education_level: text(form, "education_level", { max: 150 }),
            learning_goals: text(form, "learning_goals", { max: 2000 }),
            additional_information: text(form, "additional_information", {
              max: 3000,
            }),
            enrollment_date: contactDate(form, "enrollment_date"),
          }
        : null,
    p_profile: {
      first_name: text(form, "first_name", {
        min: 1,
        max: 100,
        label: "First name",
      }),
      last_name: text(form, "last_name", { max: 100, label: "Last name" }),
      phone: text(form, "phone", { min: 3, max: 40, label: "Phone" }),
      additional_phone: text(form, "additional_phone", { max: 40 }),
      email: email(form, "email", true),
      date_of_birth: contactDate(form, "date_of_birth"),
      gender: text(form, "gender"),
      address: text(form, "address", { max: 1000 }),
      status_id: status ? uuid(status) : "",
      responsible_employee_id: responsible ? uuid(responsible) : "",
    },
  };
}
