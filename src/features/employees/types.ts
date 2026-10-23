export type EmployeeStatus = "active" | "inactive" | "archived";
export type Employee = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  job_title: string;
  status: string;
  start_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type BusinessRole = {
  id: string;
  tenant_id: string;
  name: string;
  system_key: string | null;
  scope: string;
  created_at: string;
  updated_at: string;
};
export type SalaryConfig = {
  salary_type: string;
  amount: string | null;
  percentage: string | null;
  bonus_amount: string | null;
  bonus_percentage: string | null;
  bonus_basis: string;
  currency: string;
  updated_at: string;
};
export type SalaryEvent = {
  id: string;
  tenant_id: string;
  employee_id: string;
  previous_settings: SalaryConfig | null;
  new_settings: SalaryConfig;
  reason: string;
  changed_by: string;
  created_at: string;
};
export type InvitationPreview = {
  business: string;
  employee: string;
  role: string;
  scope: string;
  expires_at: string;
};
