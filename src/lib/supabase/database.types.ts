// Foundation schema contract. Regenerate with `npm run db:types` once local
// Supabase is running, and commit the generated result with schema changes.
import type {
  Employee,
  BusinessRole,
  SalaryConfig,
  SalaryEvent,
  InvitationPreview,
} from "@/features/employees/types";
type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};
export type AppRole =
  "owner" | "admin" | "manager" | "employee" | "teacher" | "staff";
type Tenant = {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  created_at: string;
  contact_email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  owner_id: string;
};
type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
  address: string;
  phone: string;
  is_active: boolean;
};
type Membership = {
  role_id: string;
  tenant_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
};
type BranchMembership = {
  role_id: string | null;
  tenant_id: string;
  branch_id: string;
  user_id: string;
  created_at: string;
};
export type Database = {
  public: {
    Tables: {
      employees: Table<
        Employee,
        Omit<Employee, "id" | "created_at" | "updated_at">
      >;
      employee_branches: Table<
        { tenant_id: string; employee_id: string; branch_id: string },
        { tenant_id: string; employee_id: string; branch_id: string }
      >;
      business_roles: Table<
        BusinessRole,
        { tenant_id: string; name: string; scope: string }
      >;
      business_role_permissions: Table<
        { tenant_id: string; role_id: string; permission: string },
        { tenant_id: string; role_id: string; permission: string }
      >;
      permissions: Table<
        { key: string; description: string; assignable: boolean },
        { key: string; description: string }
      >;
      tenants: Table<
        Tenant,
        {
          id?: string;
          name: string;
          slug: string;
          business_type?: string;
          created_at?: string;
          owner_id: string;
          contact_email?: string;
          phone?: string;
          address?: string;
          currency?: string;
          timezone?: string;
        }
      >;
      branches: Table<
        Branch,
        {
          id?: string;
          tenant_id: string;
          name: string;
          created_at?: string;
          address?: string;
          phone?: string;
          is_active?: boolean;
        }
      >;
      tenant_memberships: Table<
        Membership,
        {
          tenant_id: string;
          user_id: string;
          role?: AppRole;
          role_id?: string;
          is_active?: boolean;
          created_at?: string;
        }
      >;
      branch_memberships: Table<
        BranchMembership,
        {
          tenant_id: string;
          branch_id: string;
          role_id?: string | null;
          user_id: string;
          created_at?: string;
        }
      >;
      role_permissions: Table<
        { role: AppRole; permission: string },
        { role: AppRole; permission: string }
      >;
      profiles: Table<
        { id: string; full_name: string; phone: string; created_at: string },
        { id: string; full_name?: string; phone?: string; created_at?: string }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      archive_employee: {
        Args: { p_tenant: string; p_employee: string };
        Returns: undefined;
      };
      permission_grants: {
        Args: { p_tenant: string };
        Returns: { permission: string; branch_id: string | null }[];
      };
      save_employee: {
        Args: {
          p_tenant: string;
          p_id: string | null;
          p_full_name: string;
          p_phone: string;
          p_email: string;
          p_job_title: string;
          p_status: string;
          p_start_date: string;
          p_notes: string;
          p_branches: string[];
        };
        Returns: string;
      };
      save_business_role: {
        Args: {
          p_tenant: string;
          p_id: string | null;
          p_name: string;
          p_scope: string;
          p_permissions: string[];
        };
        Returns: string;
      };
      assign_member_role: {
        Args: {
          p_tenant: string;
          p_user: string;
          p_role: string;
          p_branches: string[];
          p_branch_roles: Record<string, string>;
          p_active: boolean;
        };
        Returns: undefined;
      };
      get_employee_salary: {
        Args: { p_tenant: string; p_employee: string };
        Returns: SalaryConfig | null;
      };
      salary_history: {
        Args: { p_tenant: string; p_employee: string };
        Returns: SalaryEvent[];
      };
      save_employee_salary: {
        Args: {
          p_tenant: string;
          p_employee: string;
          p_type: string;
          p_amount: string;
          p_percentage: string;
          p_bonus_amount: string;
          p_bonus_percentage: string;
          p_bonus_basis: string;
          p_currency: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      create_employee_invitation: {
        Args: { p_tenant: string; p_employee: string; p_role: string };
        Returns: string;
      };
      revoke_employee_invitation: {
        Args: { p_tenant: string; p_employee: string };
        Returns: undefined;
      };
      preview_employee_invitation: {
        Args: { p_token: string };
        Returns: InvitationPreview;
      };
      accept_employee_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      create_business: {
        Args: {
          p_name: string;
          p_business_type?: string;
          p_contact_email?: string;
          p_phone?: string;
          p_address?: string;
          p_branch_name?: string;
        };
        Returns: string;
      };
      set_business_member: {
        Args: {
          p_tenant: string;
          p_email: string;
          p_role: AppRole;
          p_branches?: string[];
          p_active?: boolean;
        };
        Returns: undefined;
      };
      list_business_members: {
        Args: { p_tenant: string };
        Returns: {
          user_id: string;
          full_name: string;
          email: string;
          role: AppRole;
          is_active: boolean;
          branch_ids: string[];
        }[];
      };
    };
    Enums: { app_role: AppRole };
    CompositeTypes: { [_ in never]: never };
  };
};
