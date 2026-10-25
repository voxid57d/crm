import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FinancePagination as Pagination } from "@/components/finance/pagination";
import { formatMoney } from "@/features/finance/money.mjs";
import type { EnrollmentRow } from "@/features/academics/group-types";
export function EnrollmentList({
  rows,
  total,
  page,
  path,
  filters = {},
  pageKey = "page",
}: {
  rows: EnrollmentRow[];
  total: number;
  page: number;
  path: string;
  filters?: Record<string, string>;
  pageKey?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Authorized academic enrollments</caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                "Student",
                "Group / course",
                "Branch",
                "Status / period",
                "Agreement",
              ].map((h) => (
                <th key={h} scope="col" className="p-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="min-w-44 p-4">
                  <Link
                    href={`/enrollments/${e.id}`}
                    className="font-medium text-primary underline"
                  >
                    {e.student_name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.student_identifier}
                  </p>
                  {e.can_open_student && (
                    <Link
                      href={`/students/${e.customer_id}`}
                      className="mt-2 block text-xs text-primary underline"
                    >
                      Student profile
                    </Link>
                  )}
                </td>
                <td className="p-4">
                  <Link
                    className="text-primary underline"
                    href={`/groups/${e.group_id}`}
                  >
                    {e.group_name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.course_name}
                  </p>
                </td>
                <td className="p-4">{e.branch_name}</td>
                <td className="p-4">
                  <Badge variant="outline">{e.status}</Badge>
                  <p className="mt-2 whitespace-nowrap text-xs text-muted-foreground">
                    {e.effective_start_date} → {e.effective_end_date ?? "Open"}
                  </p>
                </td>
                <td className="whitespace-nowrap p-4">
                  {e.agreed_price === null
                    ? "Restricted"
                    : formatMoney(e.agreed_price, e.currency)}
                  {e.pricing_model && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.pricing_model.replaceAll("_", " ")}
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="p-8 text-center text-muted-foreground"
                >
                  No authorized enrollments match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        path={path}
        filters={filters}
        page={page}
        total={total}
        pageKey={pageKey}
      />
    </div>
  );
}
