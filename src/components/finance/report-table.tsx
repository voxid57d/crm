import { formatMoney } from "@/features/finance/money.mjs";
import { financeDate } from "@/features/finance/queries";
import type {
  ReportColumn,
  ReportRow,
} from "@/features/finance/reports-config";
export function ReportTable({
  columns,
  rows,
  timezone,
  caption,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  timezone: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50">
          <tr>
            {columns.map((c) => (
              <th
                scope="col"
                key={c.key}
                className="whitespace-nowrap p-4 font-medium"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => (
            <tr key={r.id ?? String(index)} className="border-t">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={
                    c.type === "money"
                      ? "whitespace-nowrap p-4 text-right tabular-nums"
                      : "min-w-24 max-w-sm break-words p-4"
                  }
                >
                  {r[c.key] == null
                    ? "—"
                    : c.type === "money"
                      ? formatMoney(r[c.key]!)
                      : c.type === "datetime"
                        ? financeDate(r[c.key]!, timezone)
                        : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                className="p-8 text-center text-muted-foreground"
                colSpan={columns.length}
              >
                No authorized records match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
