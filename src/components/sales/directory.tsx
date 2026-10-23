import Link from "next/link";
import {
  salesOptions,
  salesFilters,
  pageNumber,
  type Search,
} from "@/features/sales/queries";
import { leadFeed } from "@/features/sales/parsers";
import { SalesFilters } from "./filters";
import { SalesNavigation } from "./navigation";
import { Kanban } from "./kanban";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputError } from "@/lib/validation.mjs";

export async function LeadDirectory({
  search,
  board = false,
}: {
  search: Search;
  board?: boolean;
}) {
  const options = await salesOptions(),
    { workspace, stages, pipelines } = options;
  if (!workspace.permissions.has("leads.view"))
    return (
      <p role="alert">
        Sales viewing permission is required in your business or assigned
        branches.
      </p>
    );
  let filters: Record<string, string>;
  try {
    filters = salesFilters(search, workspace.branch?.id);
  } catch (error) {
    return (
      <p role="alert">
        {error instanceof InputError ? error.message : "Invalid sales filters."}{" "}
        <Link href={board ? "/sales/board" : "/leads"} className="underline">
          Reset filters
        </Link>
      </p>
    );
  }
  if (board && !filters.pipeline)
    filters.pipeline =
      pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id ?? "";
  const page = pageNumber(search.page),
    base = board ? "/sales/board" : "/leads";
  const result = await workspace.supabase.rpc("lead_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
    p_board: board,
  });
  if (result.error)
    return (
      <p role="alert">
        Sales records could not load. Check branch permission and filter values.{" "}
        <Link href={base} className="underline">
          Reset
        </Link>
      </p>
    );
  const feed = leadFeed(result.data);
  const now = new Date().toISOString();
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: workspace.tenant.timezone,
    }).format(new Date(value));
  const navLink = (path: string, next?: number) => {
    const params = new URLSearchParams(filters);
    params.set("branch", filters.branch ?? "all");
    if (next !== undefined) params.set("page", String(next));
    return `${path}?${params}`;
  };
  return (
    <div className="space-y-6">
      {!board && <SalesNavigation />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {workspace.tenant.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {board ? "Sales pipeline" : "Leads"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {feed.total} matching leads ·{" "}
            {workspace.branch
              ? `Current workspace branch: ${workspace.branch.name}`
              : "All authorized branches"}
          </p>
        </div>
        <div className="flex gap-2">
          {workspace.permissions.has("leads.create") && (
            <Button asChild>
              <Link href="/leads/new">Add lead</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={navLink(board ? "/leads" : "/sales/board")}>
              {board ? "Table view" : "Kanban view"}
            </Link>
          </Button>
        </div>
      </div>
      <SalesFilters options={options} filters={filters} board={board} />
      {board ? (
        <Kanban
          key={
            JSON.stringify(filters) +
            feed.rows.map((c) => c.id + c.stage_id).join("")
          }
          tenantId={workspace.tenant.id}
          initialCards={feed.rows}
          counts={feed.stage_counts}
          stages={stages.filter((s) => s.pipeline_id === filters.pipeline)}
          canMove={workspace.branches
            .filter((b) =>
              workspace.branchPermissions.get(b.id)?.has("leads.change_stage"),
            )
            .map((b) => b.id)}
          timezone={workspace.tenant.timezone}
          now={now}
          reasons={options.reasons}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Lead",
                    "Contact",
                    "Stage / status",
                    "Branch",
                    "Sales employee",
                    "Priority",
                    "Follow-up",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {feed.rows.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <Link
                        className="font-medium text-primary underline"
                        href={`/leads/${l.id}`}
                      >
                        {l.first_name} {l.last_name}
                      </Link>
                      {l.archived && <Badge variant="outline">Archived</Badge>}
                    </td>
                    <td className="px-5 py-4">{l.phone}</td>
                    <td className="px-5 py-4">
                      <p>{stages.find((s) => s.id === l.stage_id)?.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {
                        workspace.branches.find((b) => b.id === l.branch_id)
                          ?.name
                      }
                    </td>
                    <td className="px-5 py-4">
                      {l.employee_name ?? "Unassigned"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="secondary">{l.priority}</Badge>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {l.next_follow_up ? (
                        <>
                          <p
                            className={
                              l.next_follow_up < now ? "text-destructive" : ""
                            }
                          >
                            {l.next_follow_up < now ? "Overdue · " : ""}
                            {date(l.next_follow_up)}
                          </p>
                        </>
                      ) : (
                        "None scheduled"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!feed.rows.length && (
            <div className="p-10 text-center">
              <h2 className="font-medium">No matching leads</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Change filters or create your first lead.
              </p>
            </div>
          )}
          <div className="flex justify-between border-t p-4 text-sm">
            <span>
              Page {page + 1} · {feed.total} leads
            </span>
            <div className="flex gap-4">
              {page > 0 && (
                <Link
                  className="text-primary underline"
                  href={navLink(base, page - 1)}
                >
                  Previous
                </Link>
              )}
              {(page + 1) * 20 < feed.total && (
                <Link
                  className="text-primary underline"
                  href={navLink(base, page + 1)}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
