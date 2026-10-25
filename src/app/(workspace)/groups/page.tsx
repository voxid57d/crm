import Link from "next/link";
import {
  groupDirectory,
  lmsOptions,
  branchGrant,
  teacherFilters,
} from "@/features/academics/group-queries";
import { groupStatuses } from "@/features/academics/group-types";
import type { AcademicSearch } from "@/features/academics/types";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
export const metadata = { title: "Groups" };
export default async function Groups({
  searchParams,
}: {
  searchParams: Promise<AcademicSearch>;
}) {
  const search = await searchParams,
    [d, options, teachers] = await Promise.all([
      groupDirectory(search),
      lmsOptions(),
      teacherFilters(),
    ]),
    w = d.workspace;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Groups</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Course delivery, assigned teachers and reserved seats in your
            authorized scope.
          </p>
        </div>
        {w.branches.some(
          (b) =>
            b.is_active &&
            branchGrant(w, "groups.create", b.id) &&
            branchGrant(w, "groups.view", b.id),
        ) && (
          <Button asChild>
            <Link href="/groups/new">Add group</Link>
          </Button>
        )}
      </div>
      <form className="grid items-end gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Search group name or code"
          name="q"
          maxLength={100}
          defaultValue={d.filters.q}
        />
        <SelectField
          label="Branch"
          name="branch"
          defaultValue={d.filters.branch ?? ""}
        >
          <option value="">All authorized branches</option>
          {w.branches
            .filter(
              (b) =>
                branchGrant(w, "groups.view", b.id) ||
                branchGrant(w, "groups.view_assigned", b.id),
            )
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Course"
          name="course"
          defaultValue={d.filters.course ?? ""}
        >
          <option value="">All courses</option>
          {options.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Teacher"
          name="teacher"
          defaultValue={d.filters.teacher ?? ""}
        >
          <option value="">All assigned teachers</option>
          {teachers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Status"
          name="status"
          defaultValue={d.filters.status ?? "open"}
        >
          <option value="open">Planned, active and paused</option>
          <option value="all">All statuses</option>
          {groupStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Sort"
          name="sort"
          defaultValue={d.filters.sort ?? "name"}
        >
          <option value="name">Name A–Z</option>
          <option value="start">Start date</option>
          <option value="newest">Newest first</option>
          <option value="capacity">Capacity</option>
        </SelectField>
        <Button>Apply filters</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Authorized groups</caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                "Group / course",
                "Branch",
                "Teachers",
                "Seats / period",
                "Status",
              ].map((h) => (
                <th key={h} scope="col" className="p-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="min-w-44 p-4">
                  <Link
                    className="font-medium text-primary underline"
                    href={`/groups/${g.id}`}
                  >
                    {g.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.course_name}
                    {g.code ? ` · ${g.code}` : ""}
                  </p>
                </td>
                <td className="p-4">{g.branch_name}</td>
                <td className="p-4">{g.teachers || "Not assigned"}</td>
                <td className="whitespace-nowrap p-4">
                  <p className="tabular-nums">
                    {g.reserved_seats}/{g.capacity} reserved ·{" "}
                    {g.active_enrollments} active
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.start_date} → {g.end_date ?? "Open"}
                  </p>
                </td>
                <td className="p-4">
                  <Badge variant="outline">{g.status}</Badge>
                </td>
              </tr>
            ))}
            {!d.rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-muted-foreground"
                >
                  No authorized groups match. Adjust filters or add a group.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        path="/groups"
        filters={d.filters}
        page={d.page}
        total={d.total}
      />
    </div>
  );
}
