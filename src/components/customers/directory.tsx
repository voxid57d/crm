import Link from "next/link";
import { customerOptions } from "@/features/customers/queries";
import { Field, SelectField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { uuid } from "@/lib/validation.mjs";

export type DirectoryFilters = {
  q?: string;
  branch?: string;
  status?: string;
  employee?: string;
  tag?: string;
  sort?: string;
  page?: string;
};
export async function CustomerDirectory({
  filters,
  archived = false,
  students = false,
}: {
  filters: DirectoryFilters;
  archived?: boolean;
  students?: boolean;
}) {
  const { workspace, statuses, tags, employees } = await customerOptions();
  const base = archived
    ? "/customers/archived"
    : students
      ? "/students"
      : "/customers";
  if (!workspace.permissions.has("customers.view"))
    return (
      <div className="rounded-xl border bg-white p-7">
        <h1 className="text-2xl font-semibold">
          Customer access is restricted
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your role requires customers.view in the appropriate branches.
        </p>
      </div>
    );
  const branch = filters.branch ?? workspace.branch?.id ?? "all";
  const q = (typeof filters.q === "string" ? filters.q : "")
    .slice(0, 100)
    .trim();
  const sort = ["name", "newest", "oldest"].includes(filters.sort ?? "")
    ? filters.sort!
    : "name";
  const page = Math.min(
    100000,
    Math.max(0, parseInt(filters.page ?? "0", 10) || 0),
  );
  try {
    for (const id of [
      branch === "all" ? "" : branch,
      filters.status,
      filters.employee,
      filters.tag,
    ])
      if (id) uuid(id);
  } catch {
    return (
      <p role="alert">
        Invalid directory filter.{" "}
        <Link href={base} className="underline">
          Reset filters
        </Link>
      </p>
    );
  }
  if (branch !== "all" && !workspace.branches.some((b) => b.id === branch))
    return (
      <p role="alert">
        This branch is outside your workspace.{" "}
        <Link href={base} className="underline">
          Reset filters
        </Link>
      </p>
    );
  const result = await workspace.supabase.rpc("customer_directory", {
    p_tenant: workspace.tenant.id,
    p_search: q,
    p_archived: archived,
    p_students: students,
    p_sort: sort,
    p_page: page,
    ...(branch !== "all" ? { p_branch: branch } : {}),
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.employee ? { p_employee: filters.employee } : {}),
    ...(filters.tag ? { p_tag: filters.tag } : {}),
  });
  if (result.error?.code === "42501")
    return (
      <p role="alert">
        Your role cannot view customers in this branch.{" "}
        <Link href={`${base}?branch=all`} className="underline">
          View authorized customers
        </Link>
      </p>
    );
  if (result.error)
    throw new Error(
      "Customer directory could not load. Check local services and permissions.",
    );
  const records = result.data;
  const total = records[0]?.total_count ?? 0;
  const pageLink = (next: number) => {
    const params = new URLSearchParams({ q, branch, sort, page: String(next) });
    for (const k of ["status", "employee", "tag"] as const)
      if (filters[k]) params.set(k, filters[k]);
    return `${base}?${params}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {workspace.tenant.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {archived
              ? "Archived customers"
              : students
                ? "Students"
                : "Customers"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {workspace.branch
              ? `Current branch: ${workspace.branch.name}. `
              : ""}
            One contact record across branches, with optional education details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspace.permissions.has("customers.create") && (
            <Button asChild>
              <Link href="/customers/new">Add customer / student</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={archived ? "/customers" : "/customers/archived"}>
              {archived ? "Current customers" : "Archived"}
            </Link>
          </Button>
          {(workspace.businessPermissions.has("customers.manage_settings") ||
            workspace.businessPermissions.has("customers.manage_tags")) && (
            <Button asChild variant="outline">
              <Link href="/customers/settings">Tags & settings</Link>
            </Button>
          )}
        </div>
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Search name, phone, or email"
          name="q"
          maxLength={100}
          defaultValue={q}
        />
        <SelectField label="Branch" name="branch" defaultValue={branch}>
          <option value="all">All authorized branches</option>
          {workspace.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {!b.is_active ? " (inactive)" : ""}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Customer status"
          name="status"
          defaultValue={filters.status ?? ""}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Responsible employee"
          name="employee"
          defaultValue={filters.employee ?? ""}
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Tag" name="tag" defaultValue={filters.tag ?? ""}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sort" name="sort" defaultValue={sort}>
          <option value="name">Name A–Z</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </SelectField>
        <div className="flex gap-3">
          <Button>Apply filters</Button>
          <Button asChild variant="ghost">
            <Link href={`${base}?branch=all`}>Reset</Link>
          </Button>
        </div>
      </form>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-5 py-4 text-sm text-muted-foreground">
          {records.length
            ? `${total} matching ${students ? "students" : "customers"}`
            : page > 0
              ? "No records on this page"
              : "0 matching customers"}{" "}
          · {records.length} shown
          {branch === "all"
            ? " across authorized branches"
            : " in selected branch"}
        </div>
        {records.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Customer",
                    "Contact",
                    "Status",
                    "Branches",
                    "Responsible",
                    "Tags",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.first_name} {c.last_name}
                      </Link>
                      {c.student_identifier && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Student · {c.student_identifier}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p>{c.phone}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.email}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="secondary">{c.status_name}</Badge>
                      {archived && (
                        <Badge className="mt-2" variant="outline">
                          Archived
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-48 px-5 py-4 text-xs leading-5">
                      {c.branch_ids
                        .map(
                          (id) =>
                            workspace.branches.find((b) => b.id === id)?.name ??
                            "Unavailable",
                        )
                        .join(", ") || "Unassigned"}
                    </td>
                    <td className="px-5 py-4">
                      {c.responsible_name ||
                        (c.responsible_employee_id
                          ? "Unavailable employee"
                          : "Unassigned")}
                    </td>
                    <td className="max-w-44 px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.tag_names.map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <h2 className="font-medium">
              No matching {students ? "students" : "customers"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Try another filter or add your first customer within your
              authorized branches.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between border-t px-5 py-4 text-sm">
          <span>Page {page + 1}</span>
          <div className="flex gap-3">
            {page > 0 && (
              <Link
                href={pageLink(page - 1)}
                className="font-medium text-primary underline"
              >
                Previous
              </Link>
            )}
            {(page + 1) * 20 < total && (
              <Link
                href={pageLink(page + 1)}
                className="font-medium text-primary underline"
              >
                Next
              </Link>
            )}
            {page > 0 && records.length === 0 && (
              <Link href={pageLink(0)} className="text-primary underline">
                First page
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
