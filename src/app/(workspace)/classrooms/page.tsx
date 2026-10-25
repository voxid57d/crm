import Link from "next/link";
import { classroomDirectory, canClassroom } from "@/features/academics/queries";
import type { AcademicSearch } from "@/features/academics/types";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
export const metadata = { title: "Classrooms" };
export default async function Classrooms({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const {
      workspace: w,
      rows,
      total,
      filters,
      page,
    } = await classroomDirectory(await searchParams),
    create = w.branches.some(
      (b) => b.is_active && canClassroom(w, "classrooms.manage", b.id),
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Classrooms</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Physical rooms in your authorized branches. Online instruction does
            not need a physical classroom.
          </p>
        </div>
        {create && (
          <Button asChild>
            <Link href="/classrooms/new">Add classroom</Link>
          </Button>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Field
          label="Search name or description"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
        />
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={filters.branch ?? ""}
        >
          <option value="">All authorized branches</option>
          {w.branches
            .filter((b) => canClassroom(w, "classrooms.view", b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_active ? "" : " (inactive)"}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Status"
          name="status"
          defaultValue={filters.status ?? "active"}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All classrooms</option>
        </SelectField>
        <SelectField
          label="Sort"
          name="sort"
          defaultValue={filters.sort ?? "name"}
        >
          <option value="name">Name A–Z</option>
          <option value="newest">Newest first</option>
          <option value="capacity_asc">Capacity: low to high</option>
          <option value="capacity_desc">Capacity: high to low</option>
        </SelectField>
        <Button>Apply filters</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Authorized branch classrooms</caption>
          <thead className="bg-muted/50">
            <tr>
              {["Classroom", "Branch", "Capacity", "Status"].map((h) => (
                <th scope="col" className="p-4 font-medium" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="border-t" key={r.id}>
                <td className="min-w-48 p-4">
                  <Link
                    className="font-medium text-primary underline"
                    href={`/classrooms/${r.id}`}
                  >
                    {r.name}
                  </Link>
                  <p className="mt-1 max-w-sm truncate text-xs text-muted-foreground">
                    {r.description}
                  </p>
                </td>
                <td className="p-4">
                  {r.branch_name}
                  {!r.branch_active && (
                    <p className="text-xs text-muted-foreground">
                      Branch inactive
                    </p>
                  )}
                </td>
                <td className="p-4 tabular-nums">{r.capacity}</td>
                <td className="p-4">
                  <Badge variant={r.is_active ? "secondary" : "outline"}>
                    {r.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={4}
                  className="p-10 text-center text-muted-foreground"
                >
                  No classrooms match these filters.{" "}
                  {create
                    ? "Add a physical room to an active branch."
                    : "Ask your branch manager to configure rooms."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        path="/classrooms"
        filters={filters}
        total={total}
        page={page}
      />
    </div>
  );
}
