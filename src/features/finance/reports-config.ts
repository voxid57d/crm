export type ReportColumn = {
  key: string;
  label: string;
  type?: "money" | "datetime";
};
const col = (
  key: string,
  label: string,
  type?: ReportColumn["type"],
): ReportColumn => ({ key, label, ...(type ? { type } : {}) });
const date = col("date", "Date / time", "datetime"),
  branch = col("branch", "Branch"),
  customer = col("customer", "Customer"),
  cashbox = col("cashbox", "Cashbox"),
  actor = col("actor", "Recorded by"),
  amount = col("amount", "Amount (UZS)", "money"),
  reason = col("reason", "Reason"),
  outstanding = col("outstanding", "Outstanding (UZS)", "money");
const debts = [
  date,
  col("invoice", "Invoice"),
  branch,
  customer,
  col("due", "Due date"),
  col("status", "Status"),
  col("invoiced", "Invoice total (UZS)", "money"),
  outstanding,
  col("overdue_days", "Days overdue"),
  col("aging", "Debt aging"),
];
export const financeReports = {
  payments: {
    title: "Payment collection report",
    columns: [
      date,
      branch,
      customer,
      col("method", "Method"),
      cashbox,
      col("received", "Gross received (UZS)", "money"),
      col("refunded", "Refunded to date (UZS)", "money"),
      col("allocated", "Currently allocated (UZS)", "money"),
      col("credit", "Current credit (UZS)", "money"),
      actor,
      col("reference", "Reference"),
    ],
    note: "Receipt dates select payments. Allocated, refunded and credit columns show their current lifetime state.",
  },
  debts: {
    title: "Outstanding debt report",
    columns: debts,
    note: "Current issued invoice balances; date range selects invoice issue dates. No customer is counted twice for the same invoice.",
  },
  overdue: {
    title: "Overdue invoice report",
    columns: debts,
    note: "Current overdue receivables in the business timezone; date range selects invoice issue dates.",
  },
  expenses: {
    title: "Expense report",
    columns: [
      date,
      branch,
      cashbox,
      col("category", "Category"),
      col("vendor", "Vendor"),
      amount,
      col("status", "Current status"),
      actor,
      reason,
    ],
    note: "Original posted expenses, including records later reversed. Correction movements appear separately in the cashbox transaction report.",
  },
  cashbox_transactions: {
    title: "Cashbox transaction report",
    columns: [
      date,
      branch,
      cashbox,
      col("kind", "Transaction type"),
      amount,
      actor,
      reason,
    ],
    note: "Signed cashbox movements. Transfers have two opposite legs; opening balances and adjustments are not collections.",
  },
  cashbox_balances: {
    title: "Cashbox balance report",
    columns: [
      branch,
      cashbox,
      col("currency", "Currency"),
      col("status", "Status"),
      col("balance", "Current balance (UZS)", "money"),
    ],
    note: "Current all-time ledger balances, including inactive cashboxes. Date and recorder filters do not change these balances.",
  },
  branches: {
    title: "Branch financial comparison",
    columns: [
      branch,
      col("received", "Gross received (UZS)", "money"),
      col("refunds", "Refunds (UZS)", "money"),
      col("expenses", "Net expenses (UZS)", "money"),
      outstanding,
      col("net_cash_movement", "Net cash movement (UZS)", "money"),
    ],
    note: "Period receipts, refunds, net expense movements and cash movements; current outstanding debt. Business-wide cashboxes remain outside individual branch totals.",
  },
  refunds: {
    title: "Refund report",
    columns: [date, branch, customer, cashbox, amount, actor, reason],
    note: "Actual refunds by their effective date. Each refund retains its original payment.",
  },
  customer_statement: {
    title: "Customer financial statement",
    columns: [
      date,
      branch,
      col("document", "Document"),
      col("kind", "Event"),
      col("debt_change", "Debt change (UZS)", "money"),
      col("cash_received", "Cash received (UZS)", "money"),
      col("cash_refunded", "Cash refunded (UZS)", "money"),
      actor,
      reason,
    ],
    note: "Choose a customer you can access in full. Cash receipts/refunds and debt changes are separate columns; allocations are not additional cash. Document and allocation events use recorded time, receipts/refunds use effective time.",
  },
  audit: {
    title: "Financial activity and audit report",
    columns: [
      date,
      branch,
      col("operation", "Operation"),
      col("record", "Affected record"),
      actor,
      reason,
    ],
    note: "Recorded-time events. Requires separate audit permission and access to every cashbox of a linked transaction. Private command payloads and sensitive configuration details are excluded.",
  },
} satisfies Record<
  string,
  { title: string; columns: ReportColumn[]; note: string }
>;
export type FinancialReportKind = keyof typeof financeReports;
export type ReportRow = Record<string, string | null>;
export type ReportData = { total: number; rows: ReportRow[] };
export type ReportOptions = {
  customers: { id: string; name: string }[];
  actors: { id: string; name: string }[];
  cashboxes: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};
export type FinancialDashboard = {
  metrics: Record<string, string | null>;
  trends: {
    trend_date: string;
    received: string | null;
    refunds: string | null;
    expenses: string | null;
  }[];
  branches: ReportRow[];
  recent: ReportRow[];
};
