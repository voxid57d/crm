import { academicDate } from "@/features/academics/queries";
import type { AcademicHistory } from "@/features/academics/types";
import type { Json } from "@/lib/supabase/database.types";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
const labels: Record<string, string> = {
  name: "Name",
  code: "Code",
  description: "Description",
  category_name: "Category",
  level_name: "Level",
  duration_value: "Default duration",
  duration_unit: "Duration unit",
  lesson_duration_minutes: "Lesson minutes",
  standard_price: "Standard price",
  pricing_model: "Pricing model",
  currency: "Currency",
  is_active: "Active",
  capacity: "Capacity",
  branch_name: "Branch",
  classroom_name: "Classroom",
  start_date: "Start date",
  end_date: "End date",
  effective_start_date: "Effective start",
  effective_end_date: "Effective end",
  status: "Status",
  agreed_price: "Agreed price",
  notes: "Academic administration notes",
  teachers: "Teachers",
  title: "Lesson title / topic",
  timezone: "Timezone",
  from_date: "Closure starts",
  to_date: "Closure ends (inclusive)",
  occurrence_date: "Weekly occurrence date",
  reason: "Calendar reason",
  weekday: "Weekday (Monday = 1)",
  start_time: "Local start",
  end_time: "Local end",
  effective_from: "Period starts",
  effective_to: "Period ends",
  starts_at: "Scheduled start",
  ends_at: "Scheduled end",
  teacher_name: "Assigned teacher",
  substitute_name: "Substitute teacher",
  roster_captured_at: "Expected roster captured",
};
function object(v: Json): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function display(v: Json | undefined) {
  if (Array.isArray(v))
    return (
      v
        .map((x) =>
          x && typeof x === "object" && !Array.isArray(x) && "name" in x
            ? String(x.name) + (x.is_primary ? " (primary)" : "")
            : String(x),
        )
        .join(", ") || "None"
    );
  return v == null || v === ""
    ? "Not set"
    : typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : String(v).replaceAll("_", " ");
}
export function AcademicHistoryPanel({
  history,
  zone,
  path,
  page,
  title = "Configuration history",
  filters = {},
}: {
  history: AcademicHistory;
  zone: string;
  path: string;
  page: number;
  title?: string;
  filters?: Record<string, string>;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">
        Recorded changes are retained with their actor and time in {zone}.
      </p>
      <ol className="space-y-3">
        {history.rows.map((e) => {
          const before = object(e.before_data),
            after = object(e.after_data),
            keys = Object.keys(labels).filter(
              (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
            );
          return (
            <li className="space-y-3 rounded-xl border bg-white p-5" key={e.id}>
              <p className="font-medium capitalize">{e.operation}</p>
              <p className="text-xs text-muted-foreground">
                {e.actor_name} · {academicDate(e.created_at, zone)}
              </p>
              {e.reason && <p className="text-sm">{e.reason}</p>}
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  View recorded changes
                </summary>
                <dl className="mt-3 space-y-3 text-sm">
                  {keys.map((key) => (
                    <div key={key}>
                      <dt className="font-medium">{labels[key]}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {display(before[key])} → {display(after[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          );
        })}
      </ol>
      {!history.rows.length && (
        <p className="text-sm text-muted-foreground">
          No changes on this page.
        </p>
      )}
      <Pagination
        path={path}
        page={page}
        pageKey="history_page"
        filters={filters}
        total={history.total}
      />
    </section>
  );
}
