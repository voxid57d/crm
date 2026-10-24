import type { Activity } from "@/features/customers/types";
import type { Json } from "@/lib/supabase/database.types";

const titles: Record<string, string> = {
  created: "Customer created",
  profile_updated: "Contact details updated",
  status_changed: "Customer status changed",
  branches_changed: "Branch assignments changed",
  responsible_changed: "Responsible employee changed",
  tags_changed: "Tags changed",
  student_updated: "Student profile updated",
  lead_converted: "Lead converted and linked",
  custom_fields_updated: "Custom fields updated",
  archived: "Customer archived",
  restored: "Customer restored",
  note_added: "Note / interaction recorded",
  note_edited: "Note / interaction edited",
  guardian_linked: "Guardian relationship saved",
  guardian_updated: "Guardian contact updated",
  guardian_unlinked: "Guardian relationship removed",
};
function object(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function ActivityItem({
  activity,
  at,
  labels,
  entity = "Customer",
  createdLabel,
}: {
  activity: Pick<Activity, "kind" | "detail" | "actor_name">;
  at: string;
  labels: Record<string, string>;
  entity?: string;
  createdLabel?: string;
}) {
  const detail = object(activity.detail);
  const show = (value: Json | undefined): string =>
    value === null || value === undefined || value === ""
      ? "Not set"
      : Array.isArray(value)
        ? value.map(show).join(", ")
        : typeof value === "object"
          ? Object.entries(value)
              .filter(
                ([key]) =>
                  ![
                    "tenant_id",
                    "customer_id",
                    "id",
                    "created_at",
                    "updated_at",
                    "archived_at",
                  ].includes(key),
              )
              .map(
                ([key, v]) =>
                  `${labels[key] ?? key.replaceAll("_", " ")}: ${show(v)}`,
              )
              .join("; ")
          : (labels[String(value)] ?? String(value));
  const before = detail.before,
    after = detail.after ?? detail.submitted;
  const previous = object(before),
    next = object(after);
  const changes = Object.keys({ ...previous, ...next }).filter(
    (key) =>
      ![
        "tenant_id",
        "customer_id",
        "id",
        "created_at",
        "updated_at",
        "archived_at",
      ].includes(key) &&
      JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
  );
  return (
    <article className="rounded-xl border bg-white p-4">
      <p className="text-sm font-medium">
        {(activity.kind === "created" && createdLabel
          ? createdLabel
          : activity.kind === "student_updated" && detail.before === null
            ? "Student profile added"
            : (titles[activity.kind] ?? activity.kind.replaceAll("_", " "))
        )
          .replace(/^Customer/, entity)
          .replace(/^Contact details/, `${entity} details`)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {activity.actor_name} · {at}
      </p>
      {(["body", "notes", "outcome"] as const).map((key) =>
        typeof detail[key] === "string" && detail[key] ? (
          <p
            key={key}
            className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground"
          >
            {String(detail[key])}
          </p>
        ) : null,
      )}
      {(before !== undefined || after !== undefined) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            View changes
          </summary>
          <dl className="mt-3 space-y-3 text-xs">
            {changes.length ? (
              changes.map((key) => (
                <div key={key}>
                  <dt className="font-medium capitalize">
                    {labels[key] ?? key.replaceAll("_", " ")}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                    {show(previous[key])} → {show(next[key])}
                  </dd>
                </div>
              ))
            ) : (
              <div>
                <dt className="sr-only">Change</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {show(before)} → {show(after)}
                </dd>
              </div>
            )}
          </dl>
        </details>
      )}
      {activity.kind.startsWith("guardian_") && (
        <p className="mt-2 text-xs text-muted-foreground">
          {detail.relationship
            ? `Relationship: ${show(detail.relationship)}. `
            : ""}
          {detail.emergency === true ? "Emergency contact." : ""} Contact
          history is retained.
        </p>
      )}
    </article>
  );
}
