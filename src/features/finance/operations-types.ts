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
};
export type PaymentOptions = {
  customers: { id: string; name: string; phone: string }[];
  cashboxes: { id: string; name: string; branch_id: string | null }[];
  invoices: InvoiceChoice[];
};
