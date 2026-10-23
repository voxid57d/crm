import type { Database, Json } from "@/lib/supabase/database.types";
export type Cashbox = Omit<
  Database["public"]["Tables"]["cashboxes"]["Row"],
  "creation_key" | "creation_payload"
>;
export type CashboxRow = Pick<
  Cashbox,
  | "id"
  | "branch_id"
  | "name"
  | "cashbox_type"
  | "currency"
  | "is_active"
  | "version"
  | "created_at"
> & { branch_name: string | null; balance: string };
export type LedgerRow = {
  id: string;
  transaction_id: string;
  amount: string;
  currency: string;
  kind: string;
  reason: string;
  actor_id: string;
  actor_name: string;
  employee_id: string | null;
  posted_at: string;
};
export type FinancialAudit = {
  id: string;
  operation: string;
  actor_name: string;
  reason: string;
  before_data: Json;
  after_data: Json;
  created_at: string;
};
export type CashboxDetail = {
  cashbox: Cashbox;
  branch_name: string | null;
  balance: string;
  has_entries: boolean;
  total: number;
  rows: LedgerRow[];
  actors: { id: string; name: string }[];
  audit_total: number;
  audit: FinancialAudit[];
};
export type FinanceSearch = Record<string, string | string[] | undefined>;
