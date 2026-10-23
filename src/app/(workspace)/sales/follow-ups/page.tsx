import Link from "next/link";
import {
  salesOptions,
  salesFilters,
  pageNumber,
  type Search,
} from "@/features/sales/queries";
import { followupFeed } from "@/features/sales/parsers";
import { SalesFilters } from "@/components/sales/filters";
import { SalesIdentity } from "@/components/sales/fields";
import { completeFollowup } from "@/features/sales/actions";
import { ActionForm } from "@/components/forms/action-form";
import { TextArea } from "@/components/customers/fields";
export const metadata = { title: "Sales follow-ups" };
export default async function Followups({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams,
    options = await salesOptions(),
    { workspace } = options;
  if (!workspace.permissions.has("leads.view"))
    return <p role="alert">Lead viewing permission is required.</p>;
  let filters: Record<string, string>;
  try {
    filters = salesFilters(search, workspace.branch?.id);
  } catch {
    return <p role="alert">Invalid follow-up filters.</p>;
  }
  const page = pageNumber(search.page);
  const result = await workspace.supabase.rpc("sales_followup_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  if (result.error)
    return (
      <p role="alert">
        Follow-ups could not load. Check employee, dates, and branch
        permissions.
      </p>
    );
  const feed = followupFeed(result.data),
    now = new Date().toISOString();
  const date = (v: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: workspace.tenant.timezone,
    }).format(new Date(v));
  const link = (p: number) =>
    `/sales/follow-ups?${new URLSearchParams({ ...filters, branch: filters.branch ?? "all", page: String(p) })}`;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Sales follow-ups</h1>
      <p className="text-sm text-muted-foreground">
        {feed.total} matching activities · Scheduled dates use{" "}
        {workspace.tenant.timezone}. Open a lead profile to schedule or edit
        pending activities.
      </p>
      <SalesFilters options={options} filters={filters} followups />
      <div className="space-y-4">
        {feed.rows.map((f) => (
          <article key={f.id} className="rounded-xl border bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <Link
                href={`/leads/${f.lead_id}#followups`}
                className="font-medium text-primary underline"
              >
                {f.lead_name}
              </Link>
              <p
                className={
                  f.completed_at
                    ? "text-xs text-muted-foreground"
                    : f.scheduled_at < now
                      ? "text-xs text-destructive"
                      : "text-xs text-primary"
                }
              >
                {f.completed_at
                  ? "Completed"
                  : f.scheduled_at < now
                    ? "Overdue"
                    : "Upcoming"}{" "}
                · {date(f.scheduled_at)}
              </p>
            </div>
            <p className="mt-2 text-sm">
              {f.kind.replaceAll("_", " ")} · {f.employee_name}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {f.description}
            </p>
            {f.completed_at ? (
              <p className="mt-3 text-sm">Outcome: {f.outcome_notes}</p>
            ) : (
              workspace.branchPermissions
                .get(f.branch_id)
                ?.has("leads.manage_followups") && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-primary">
                    Complete follow-up
                  </summary>
                  <div className="mt-4">
                    <ActionForm
                      action={completeFollowup}
                      submit="Mark completed"
                    >
                      <SalesIdentity
                        tenantId={workspace.tenant.id}
                        leadId={f.lead_id}
                      />
                      <input type="hidden" name="followup_id" value={f.id} />
                      <TextArea
                        label="Outcome notes"
                        name="outcome_notes"
                        required
                        maxLength={3000}
                      />
                    </ActionForm>
                  </div>
                </details>
              )
            )}
          </article>
        ))}
        {!feed.rows.length && (
          <p className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">
            No matching follow-ups.
          </p>
        )}
      </div>
      <div className="flex justify-between text-sm">
        <span>Page {page + 1}</span>
        <div className="flex gap-4">
          {page > 0 && (
            <Link href={link(page - 1)} className="text-primary underline">
              Previous
            </Link>
          )}
          {(page + 1) * 20 < feed.total && (
            <Link href={link(page + 1)} className="text-primary underline">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
