import Link from "next/link";
import { getWorkspace } from "@/features/workspace/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, SelectField } from "@/components/forms/field";
import type { EmployeeStatus } from "@/features/employees/types";

export const metadata = { title: "Employees" };
export default async function EmployeeDirectory({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    branch?: string;
    page?: string;
  }>;
}) {
  const workspace = await getWorkspace();
  const filters = await searchParams;
  if (!workspace.permissions.has("employees.view"))
    return (
      <div className="rounded-xl border bg-white p-8">
        <h1 className="text-2xl font-semibold">
          Employee directory access is restricted
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Your role does not include employee viewing permission.
        </p>
      </div>
    );
  const q = (filters.q ?? "").slice(0, 100);
  const status = ["active", "inactive", "archived"].includes(
    filters.status ?? "",
  )
    ? filters.status!
    : "all";
  const branch = filters.branch ?? "";
  const page = Math.min(
    100000,
    Math.max(0, Number.parseInt(filters.page ?? "0", 10) || 0),
  );
  if (branch && !workspace.branches.some((b) => b.id === branch))
    return (
      <div role="alert" className="rounded-xl border bg-white p-8">
        This branch filter is not authorized.{" "}
        <Link href="/employees" className="text-primary underline">
          Reset filters
        </Link>
      </div>
    );
  let query = workspace.supabase
    .from("employees")
    .select("*", { count: "exact" })
    .eq("tenant_id", workspace.tenant.id)
    .order("full_name")
    .order("id");
  if (status !== "all") query = query.eq("status", status as EmployeeStatus);
  const search = q.replace(/[^\p{L}\p{N}\s@+.-]/gu, " ").trim();
  if (search)
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,job_title.ilike.%${search}%`,
    );
  if (branch) {
    const assignment = await workspace.supabase
      .from("employee_branches")
      .select("employee_id")
      .eq("tenant_id", workspace.tenant.id)
      .eq("branch_id", branch);
    if (assignment.error) throw new Error("Branch filter could not load.");
    query = query.in(
      "id",
      assignment.data.map((a) => a.employee_id),
    );
  }
  const result = await query.range(page * 20, page * 20 + 19);
  if (result.error)
    throw new Error(
      "Employee directory could not load. Check local migrations.",
    );
  const ids = result.data.map((e) => e.id);
  const assignment = ids.length
    ? await workspace.supabase
        .from("employee_branches")
        .select("*")
        .eq("tenant_id", workspace.tenant.id)
        .in("employee_id", ids)
    : { data: [], error: null };
  if (assignment.error) throw new Error("Assignments could not load.");
  const pageLink = (index: number) =>
    `/employees?${new URLSearchParams({ q, status, branch, page: String(index) })}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {workspace.tenant.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Employees</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            People across your authorized branches, with or without CRM
            accounts.
          </p>
        </div>
        {workspace.permissions.has("employees.create") && (
          <Button asChild>
            <Link href="/employees/new">Add employee</Link>
          </Button>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
        <Field
          label="Search name, email, phone or job"
          name="q"
          maxLength={100}
          defaultValue={q}
        />
        <SelectField label="Status" name="status" defaultValue={status}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </SelectField>
        <SelectField label="Branch" name="branch" defaultValue={branch}>
          <option value="">All authorized branches</option>
          {workspace.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <Button type="submit">Filter</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {result.count ?? 0} matching employees. Salary information is excluded
        from this directory.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {["Employee", "Contact", "Branches", "Status", "CRM account"].map(
                (label) => (
                  <th key={label} className="px-5 py-4 font-medium">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {result.data.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="px-5 py-4">
                  <Link
                    href={`/employees/${e.id}`}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {e.full_name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.job_title || "No job title"}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <p>{e.phone || "No phone"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.email || "No email"}
                  </p>
                </td>
                <td className="max-w-60 px-5 py-4 text-xs">
                  {assignment.data
                    .filter((a) => a.employee_id === e.id)
                    .map(
                      (a) =>
                        workspace.branches.find((b) => b.id === a.branch_id)
                          ?.name,
                    )
                    .join(" · ") || "Unassigned"}
                </td>
                <td className="px-5 py-4">
                  <Badge
                    variant={e.status === "active" ? "secondary" : "outline"}
                  >
                    {e.status}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-xs text-muted-foreground">
                  {e.user_id ? "Linked" : "Administrative record"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.data.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No employees match these filters in your permitted scope.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        {page > 0 ? (
          <Link href={pageLink(page - 1)} className="text-primary underline">
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span>Page {page + 1}</span>
        {(page + 1) * 20 < (result.count ?? 0) ? (
          <Link href={pageLink(page + 1)} className="text-primary underline">
            Next
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
