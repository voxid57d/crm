export type PaymentRow = {
  id: string;
  branch_id: string;
  customer_id: string;
  cashbox_id: string;
  currency: string;
  amount: string;
  allocated: string;
  credit: string;
  method: string;
  paid_at: string;
  external_reference: string;
  notes: string;
  customer_name: string;
  cashbox_name: string;
  actor_id: string;
  actor_name: string;
};
export type AllocationRow = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  amount: string;
  remaining: string;
  reversal_of: string | null;
  created_at: string;
  reason: string;
  actor_name: string;
};
export type InvoiceChoice = {
  id: string;
  invoice_number: string;
  outstanding: string;
  branch_id: string;
};
export type PaymentDetail = {
  payment: PaymentRow;
  allocations: AllocationRow[];
  invoices: InvoiceChoice[];
  refunded: string;
  refundable: string;
  refunds: {
    id: string;
    amount: string;
    occurred_at: string;
    cashbox_name: string;
    actor_name: string;
    reason: string;
  }[];
};
export type OperationKind = "expense" | "transfer" | "refund";
export type OperationRow = {
  id: string;
  kind: OperationKind;
  branch_id: string | null;
  customer_id: string | null;
  payment_id: string | null;
  cashbox_id: string;
  destination_id: string | null;
  category_id: string | null;
  transaction_id: string;
  amount: string;
  currency: string;
  occurred_at: string;
  reason: string;
  actor_id: string;
  actor_name: string;
  cashbox_name: string;
  destination_name: string | null;
  category_name: string;
  customer_name: string;
  vendor: string;
  reversed: boolean;
  reversal?: {
    id: string;
    reason: string;
    actor_name: string;
    occurred_at: string;
  } | null;
};
export type ExpenseCategory = {
  id: string;
  name: string;
  is_active: boolean;
  version: number;
};
export type OperationOptions = {
  cashboxes: {
    id: string;
    name: string;
    branch_id: string | null;
    currency: string;
  }[];
  categories: ExpenseCategory[];
};
export type TransactionReview = {
  id: string;
  kind: string;
  reason: string;
  occurred_at: string;
  posted_at: string;
  actor_name: string;
  reversed: boolean;
  reversal_of: string | null;
  cashboxes: {
    id: string;
    branch_id: string | null;
    name: string;
    amount: string;
  }[];
};
export type PaymentOptions = {
  customers: { id: string; name: string; phone: string }[];
  cashboxes: { id: string; name: string; branch_id: string | null }[];
  invoices: InvoiceChoice[];
};
