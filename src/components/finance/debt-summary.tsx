import { formatMoney } from "@/features/finance/money.mjs";
import type { DebtSummary as Summary } from "@/features/finance/invoice-types";
export function DebtSummary({
  summary,
  charges = false,
}: {
  summary: Summary;
  charges?: boolean;
}) {
  const cards = [
    ["Outstanding", summary.outstanding],
    ["Overdue", summary.overdue],
    ...(charges
      ? [
          ["Issued charges before voids", summary.issued_charges],
          ["Voided charges", summary.voided_charges],
        ]
      : []),
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, amount]) => (
          <div key={label} className="space-y-3 rounded-xl border bg-white p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="break-words text-xl font-semibold tabular-nums">
              {formatMoney(amount, summary.currency)}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="p-4 text-left font-semibold">
            Outstanding debt aging
          </caption>
          <thead>
            <tr>
              {[
                "Not yet due / due today",
                "1–7 days",
                "8–30 days",
                "31–60 days",
                "Over 60 days",
              ].map((label) => (
                <th
                  className="whitespace-nowrap px-4 pb-2 font-medium"
                  scope="col"
                  key={label}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {[
                summary.not_due,
                summary.days_1_7,
                summary.days_8_30,
                summary.days_31_60,
                summary.days_over_60,
              ].map((v, i) => (
                <td key={i} className="whitespace-nowrap p-4 tabular-nums">
                  {formatMoney(v, summary.currency)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
