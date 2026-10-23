import type { SalaryConfig } from "@/features/employees/types";

const labels: Record<string, string> = {
  none: "No salary configuration",
  fixed_monthly: "Fixed monthly salary",
  hourly: "Hourly rate",
  per_lesson: "Per-lesson rate",
  percentage: "Percentage compensation",
  base_bonus: "Base salary plus bonus",
};
export function SalarySummary({ config }: { config: SalaryConfig | null }) {
  if (!config)
    return (
      <p className="text-sm text-muted-foreground">
        No configuration recorded.
      </p>
    );
  const fields = [
    { label: "Type", value: labels[config.salary_type] ?? config.salary_type },
    { label: "Currency", value: config.currency },
    { label: "Amount / rate", value: config.amount },
    {
      label: "Percentage",
      value: config.percentage ? `${config.percentage}%` : null,
    },
    { label: "Bonus amount", value: config.bonus_amount },
    {
      label: "Bonus percentage",
      value: config.bonus_percentage ? `${config.bonus_percentage}%` : null,
    },
    { label: "Basis / bonus conditions", value: config.bonus_basis },
  ].filter((field) => field.value !== null && field.value !== "");
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      {fields.map((field) => (
        <div key={field.label} className="contents">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="break-words">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
