"use client";
import { useState } from "react";
import { Field, SelectField } from "./field";
import type { SalaryConfig } from "@/features/employees/types";

export function SalaryFields({
  tenantId,
  employeeId,
  currency,
  config,
}: {
  tenantId: string;
  employeeId: string;
  currency: string;
  config: SalaryConfig | null;
}) {
  const [type, setType] = useState(config?.salary_type ?? "none");
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="employee_id" value={employeeId} />
      <SelectField
        label="Salary configuration type"
        name="salary_type"
        value={type}
        onChange={(event) => setType(event.target.value)}
      >
        <option value="none">No salary configuration</option>
        <option value="fixed_monthly">Fixed monthly salary</option>
        <option value="hourly">Hourly rate</option>
        <option value="per_lesson">Per-lesson rate</option>
        <option value="percentage">Percentage compensation</option>
        <option value="base_bonus">Base salary plus bonus</option>
      </SelectField>
      <Field
        label="Currency"
        name="currency"
        required
        minLength={3}
        maxLength={3}
        defaultValue={config?.currency ?? currency}
      />
      {["fixed_monthly", "hourly", "per_lesson", "base_bonus"].includes(
        type,
      ) && (
        <Field
          label={type === "base_bonus" ? "Base amount" : "Amount / rate"}
          name="amount"
          inputMode="decimal"
          required
          pattern="[0-9]{1,16}(\.[0-9]{1,2})?"
          defaultValue={config?.amount ?? ""}
        />
      )}
      {type === "percentage" && (
        <Field
          label="Compensation percentage (0–100)"
          name="percentage"
          required
          inputMode="decimal"
          pattern="[0-9]{1,3}(\.[0-9]{1,4})?"
          defaultValue={config?.percentage ?? ""}
        />
      )}
      {type === "base_bonus" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Bonus amount (optional)"
            name="bonus_amount"
            inputMode="decimal"
            pattern="[0-9]{1,16}(\.[0-9]{1,2})?"
            defaultValue={config?.bonus_amount ?? ""}
          />
          <Field
            label="Bonus percentage (optional, 0–100)"
            name="bonus_percentage"
            inputMode="decimal"
            pattern="[0-9]{1,3}(\.[0-9]{1,4})?"
            defaultValue={config?.bonus_percentage ?? ""}
          />
        </div>
      )}
      {["percentage", "base_bonus"].includes(type) && (
        <Field
          label="Percentage basis / bonus conditions"
          name="bonus_basis"
          required
          maxLength={1000}
          defaultValue={config?.bonus_basis ?? ""}
        />
      )}
      <Field
        label="Reason for this change (required for audit history)"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        Enter plain decimal values. These settings describe compensation only;
        the application does not calculate earnings or pay salaries. Choosing no
        configuration retains all prior audit entries.
      </p>
    </>
  );
}
