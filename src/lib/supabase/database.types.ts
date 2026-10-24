export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      branch_memberships: {
        Row: {
          branch_id: string;
          created_at: string;
          role_id: string | null;
          tenant_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          role_id?: string | null;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          role_id?: string | null;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_memberships_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "branch_memberships_tenant_id_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "branch_memberships_tenant_id_user_id_fkey";
            columns: ["tenant_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tenant_memberships";
            referencedColumns: ["tenant_id", "user_id"];
          },
        ];
      };
      branches: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          phone: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          phone?: string;
          tenant_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          phone?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      business_role_permissions: {
        Row: {
          permission: string;
          role_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          permission: string;
          role_id: string;
          tenant_id: string;
        };
        Update: {
          permission?: string;
          role_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_role_permissions_permission_fkey";
            columns: ["permission"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "business_role_permissions_tenant_id_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      business_roles: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          scope: string;
          system_key: string | null;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          scope: string;
          system_key?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          scope?: string;
          system_key?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      cashbox_transfers: {
        Row: {
          amount: number;
          currency: string;
          destination_id: string;
          id: string;
          occurred_at: string;
          source_id: string;
          tenant_id: string;
          transaction_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          currency: string;
          destination_id: string;
          id?: string;
          occurred_at: string;
          source_id: string;
          tenant_id: string;
          transaction_id: string;
        };
        Update: {
          amount?: number;
          currency?: string;
          destination_id?: string;
          id?: string;
          occurred_at?: string;
          source_id?: string;
          tenant_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cashbox_transfers_tenant_id_destination_id_currency_fkey";
            columns: ["tenant_id", "destination_id", "currency"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
          {
            foreignKeyName: "cashbox_transfers_tenant_id_source_id_currency_fkey";
            columns: ["tenant_id", "source_id", "currency"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
          {
            foreignKeyName: "cashbox_transfers_tenant_id_transaction_id_fkey";
            columns: ["tenant_id", "transaction_id"];
            isOneToOne: true;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      cashboxes: {
        Row: {
          allow_negative: boolean;
          branch_id: string | null;
          cashbox_type: string;
          created_at: string;
          created_by: string;
          creation_key: string;
          creation_payload: NonNullable<Json>;
          currency: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          allow_negative?: boolean;
          branch_id?: string | null;
          cashbox_type: string;
          created_at?: string;
          created_by: string;
          creation_key: string;
          creation_payload: NonNullable<Json>;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          allow_negative?: boolean;
          branch_id?: string | null;
          cashbox_type?: string;
          created_at?: string;
          created_by?: string;
          creation_key?: string;
          creation_payload?: NonNullable<Json>;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cashboxes_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "finance_currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "cashboxes_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "cashboxes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_activities: {
        Row: {
          actor_id: string;
          actor_name: string;
          created_at: string;
          customer_id: string;
          detail: NonNullable<Json>;
          id: string;
          kind: string;
          notes_only: boolean;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          actor_name: string;
          created_at?: string;
          customer_id: string;
          detail?: NonNullable<Json>;
          id?: string;
          kind: string;
          notes_only?: boolean;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          actor_name?: string;
          created_at?: string;
          customer_id?: string;
          detail?: NonNullable<Json>;
          id?: string;
          kind?: string;
          notes_only?: boolean;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_activities_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      customer_branches: {
        Row: {
          branch_id: string;
          customer_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          customer_id: string;
          tenant_id: string;
        };
        Update: {
          branch_id?: string;
          customer_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_branches_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "customer_branches_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      customer_field_definitions: {
        Row: {
          created_at: string;
          field_type: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          field_type: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          field_type?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_field_definitions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_field_values: {
        Row: {
          customer_id: string;
          field_id: string;
          tenant_id: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          customer_id: string;
          field_id: string;
          tenant_id: string;
          value: string;
        };
        Update: {
          customer_id?: string;
          field_id?: string;
          tenant_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_field_values_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "customer_field_values_tenant_id_field_id_fkey";
            columns: ["tenant_id", "field_id"];
            isOneToOne: false;
            referencedRelation: "customer_field_definitions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      customer_notes: {
        Row: {
          author_id: string;
          author_name: string;
          body: string;
          created_at: string;
          customer_id: string;
          id: string;
          kind: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          author_name: string;
          body: string;
          created_at?: string;
          customer_id: string;
          id?: string;
          kind: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          author_name?: string;
          body?: string;
          created_at?: string;
          customer_id?: string;
          id?: string;
          kind?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_notes_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      customer_statuses: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_statuses_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_tag_links: {
        Row: {
          customer_id: string;
          tag_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          customer_id: string;
          tag_id: string;
          tenant_id: string;
        };
        Update: {
          customer_id?: string;
          tag_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_tag_links_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "customer_tag_links_tenant_id_tag_id_fkey";
            columns: ["tenant_id", "tag_id"];
            isOneToOne: false;
            referencedRelation: "customer_tags";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      customer_tags: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          additional_phone: string | null;
          address: string | null;
          archived_at: string | null;
          created_at: string;
          date_of_birth: string | null;
          email: string | null;
          first_name: string;
          gender: string | null;
          id: string;
          last_name: string;
          phone: string;
          responsible_employee_id: string | null;
          status_id: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          additional_phone?: string | null;
          address?: string | null;
          archived_at?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string | null;
          first_name: string;
          gender?: string | null;
          id?: string;
          last_name?: string;
          phone: string;
          responsible_employee_id?: string | null;
          status_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          additional_phone?: string | null;
          address?: string | null;
          archived_at?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string | null;
          first_name?: string;
          gender?: string | null;
          id?: string;
          last_name?: string;
          phone?: string;
          responsible_employee_id?: string | null;
          status_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_tenant_id_responsible_employee_id_fkey";
            columns: ["tenant_id", "responsible_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "customers_tenant_id_status_id_fkey";
            columns: ["tenant_id", "status_id"];
            isOneToOne: false;
            referencedRelation: "customer_statuses";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employee_branches: {
        Row: {
          branch_id: string;
          employee_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          employee_id: string;
          tenant_id: string;
        };
        Update: {
          branch_id?: string;
          employee_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_branches_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employee_branches_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employee_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          employee_id: string;
          expires_at: string;
          id: string;
          invited_by: string;
          revoked_at: string | null;
          role_id: string;
          tenant_id: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          employee_id: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          revoked_at?: string | null;
          role_id: string;
          tenant_id: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          employee_id?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          revoked_at?: string | null;
          role_id?: string;
          tenant_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_invitations_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employee_invitations_tenant_id_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employee_salary_history: {
        Row: {
          changed_by: string;
          created_at: string;
          employee_id: string;
          id: string;
          new_settings: NonNullable<Json>;
          previous_settings: Json | null;
          reason: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_by: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          new_settings: NonNullable<Json>;
          previous_settings?: Json | null;
          reason: string;
          tenant_id: string;
        };
        Update: {
          changed_by?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          new_settings?: NonNullable<Json>;
          previous_settings?: Json | null;
          reason?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_salary_history_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employee_salary_settings: {
        Row: {
          amount: number | null;
          bonus_amount: number | null;
          bonus_basis: string;
          bonus_percentage: number | null;
          currency: string;
          employee_id: string;
          percentage: number | null;
          salary_type: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          bonus_amount?: number | null;
          bonus_basis?: string;
          bonus_percentage?: number | null;
          currency: string;
          employee_id: string;
          percentage?: number | null;
          salary_type: string;
          tenant_id: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          amount?: number | null;
          bonus_amount?: number | null;
          bonus_basis?: string;
          bonus_percentage?: number | null;
          currency?: string;
          employee_id?: string;
          percentage?: number | null;
          salary_type?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_salary_settings_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: true;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employees: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          job_title: string;
          notes: string;
          phone: string;
          start_date: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          job_title?: string;
          notes?: string;
          phone?: string;
          start_date: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          job_title?: string;
          notes?: string;
          phone?: string;
          start_date?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_tenant_id_user_id_fkey";
            columns: ["tenant_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "tenant_memberships";
            referencedColumns: ["tenant_id", "user_id"];
          },
        ];
      };
      expense_categories: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
          version?: number;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expense_categories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          branch_id: string;
          cashbox_id: string;
          category_id: string;
          category_name: string;
          currency: string;
          description: string;
          id: string;
          occurred_at: string;
          tenant_id: string;
          transaction_id: string;
          vendor: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          branch_id: string;
          cashbox_id: string;
          category_id: string;
          category_name: string;
          currency: string;
          description: string;
          id?: string;
          occurred_at: string;
          tenant_id: string;
          transaction_id: string;
          vendor?: string;
        };
        Update: {
          amount?: number;
          branch_id?: string;
          cashbox_id?: string;
          category_id?: string;
          category_name?: string;
          currency?: string;
          description?: string;
          id?: string;
          occurred_at?: string;
          tenant_id?: string;
          transaction_id?: string;
          vendor?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "expenses_tenant_id_cashbox_id_currency_fkey";
            columns: ["tenant_id", "cashbox_id", "currency"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
          {
            foreignKeyName: "expenses_tenant_id_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "expenses_tenant_id_transaction_id_fkey";
            columns: ["tenant_id", "transaction_id"];
            isOneToOne: true;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      finance_currencies: {
        Row: {
          code: string;
          minor_units: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          minor_units: number;
        };
        Update: {
          code?: string;
          minor_units?: number;
        };
        Relationships: [];
      };
      financial_audit_events: {
        Row: {
          actor_id: string;
          actor_name: string;
          after_data: NonNullable<Json>;
          before_data: Json | null;
          cashbox_id: string | null;
          created_at: string;
          id: string;
          invoice_id: string | null;
          operation: string;
          reason: string;
          request_key: string | null;
          request_payload: Json | null;
          tenant_id: string;
          transaction_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          actor_name: string;
          after_data: NonNullable<Json>;
          before_data?: Json | null;
          cashbox_id?: string | null;
          created_at?: string;
          id?: string;
          invoice_id?: string | null;
          operation: string;
          reason?: string;
          request_key?: string | null;
          request_payload?: Json | null;
          tenant_id: string;
          transaction_id?: string | null;
        };
        Update: {
          actor_id?: string;
          actor_name?: string;
          after_data?: NonNullable<Json>;
          before_data?: Json | null;
          cashbox_id?: string | null;
          created_at?: string;
          id?: string;
          invoice_id?: string | null;
          operation?: string;
          reason?: string;
          request_key?: string | null;
          request_payload?: Json | null;
          tenant_id?: string;
          transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "financial_audit_events_tenant_id_cashbox_id_fkey";
            columns: ["tenant_id", "cashbox_id"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "financial_audit_events_tenant_id_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "financial_audit_events_tenant_id_transaction_id_fkey";
            columns: ["tenant_id", "transaction_id"];
            isOneToOne: false;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      financial_configuration_events: {
        Row: {
          actor_id: string;
          actor_name: string;
          after_data: NonNullable<Json>;
          before_data: Json | null;
          category_id: string;
          created_at: string;
          id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          actor_name: string;
          after_data: NonNullable<Json>;
          before_data?: Json | null;
          category_id: string;
          created_at?: string;
          id?: string;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          actor_name?: string;
          after_data?: NonNullable<Json>;
          before_data?: Json | null;
          category_id?: string;
          created_at?: string;
          id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_configuration_events_tenant_id_category_id_fkey";
            columns: ["tenant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "financial_configuration_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_ledger_entries: {
        Row: {
          amount: number;
          cashbox_id: string;
          currency: string;
          id: string;
          kind: string;
          tenant_id: string;
          transaction_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          cashbox_id: string;
          currency: string;
          id?: string;
          kind: string;
          tenant_id: string;
          transaction_id: string;
        };
        Update: {
          amount?: number;
          cashbox_id?: string;
          currency?: string;
          id?: string;
          kind?: string;
          tenant_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_ledger_entries_tenant_id_cashbox_id_currency_fkey";
            columns: ["tenant_id", "cashbox_id", "currency"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
          {
            foreignKeyName: "financial_ledger_entries_tenant_id_transaction_id_kind_cur_fkey";
            columns: ["tenant_id", "transaction_id", "kind", "currency"];
            isOneToOne: false;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id", "kind", "currency"];
          },
        ];
      };
      financial_transactions: {
        Row: {
          actor_id: string;
          actor_name: string;
          currency: string;
          employee_id: string | null;
          id: string;
          idempotency_key: string;
          kind: string;
          occurred_at: string | null;
          posted_at: string;
          reason: string;
          request_payload: NonNullable<Json>;
          reversal_of: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          actor_name: string;
          currency: string;
          employee_id?: string | null;
          id?: string;
          idempotency_key: string;
          kind: string;
          occurred_at?: string | null;
          posted_at?: string;
          reason: string;
          request_payload: NonNullable<Json>;
          reversal_of?: string | null;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          actor_name?: string;
          currency?: string;
          employee_id?: string | null;
          id?: string;
          idempotency_key?: string;
          kind?: string;
          occurred_at?: string | null;
          posted_at?: string;
          reason?: string;
          request_payload?: NonNullable<Json>;
          reversal_of?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_transactions_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "finance_currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "financial_transactions_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "financial_transactions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_transactions_tenant_id_reversal_of_fkey";
            columns: ["tenant_id", "reversal_of"];
            isOneToOne: false;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      guardians: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          phone: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          phone: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          phone?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guardians_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_items: {
        Row: {
          description: string;
          discount_amount: number;
          id: string;
          invoice_id: string;
          line_total: number | null;
          position: number;
          quantity: number;
          tenant_id: string;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          description: string;
          discount_amount?: number;
          id?: string;
          invoice_id: string;
          line_total?: never;
          position: number;
          quantity: number;
          tenant_id: string;
          unit_price: number;
        };
        Update: {
          description?: string;
          discount_amount?: number;
          id?: string;
          invoice_id?: string;
          line_total?: never;
          position?: number;
          quantity?: number;
          tenant_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_tenant_id_invoice_id_fkey";
            columns: ["tenant_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      invoice_number_counters: {
        Row: {
          last_number: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          last_number: number;
          tenant_id: string;
        };
        Update: {
          last_number?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_number_counters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_receivable_entries: {
        Row: {
          allocation_id: string | null;
          amount: number;
          audit_event_id: string;
          created_at: string;
          currency: string;
          id: string;
          invoice_id: string;
          kind: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          allocation_id?: string | null;
          amount: number;
          audit_event_id: string;
          created_at?: string;
          currency: string;
          id?: string;
          invoice_id: string;
          kind: string;
          tenant_id: string;
        };
        Update: {
          allocation_id?: string | null;
          amount?: number;
          audit_event_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          invoice_id?: string;
          kind?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_receivable_entries_tenant_id_allocation_id_invoice_fkey";
            columns: ["tenant_id", "allocation_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "payment_allocations";
            referencedColumns: ["tenant_id", "id", "invoice_id"];
          },
          {
            foreignKeyName: "invoice_receivable_entries_tenant_id_audit_event_id_fkey";
            columns: ["tenant_id", "audit_event_id"];
            isOneToOne: false;
            referencedRelation: "financial_audit_events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoice_receivable_entries_tenant_id_invoice_id_currency_fkey";
            columns: ["tenant_id", "invoice_id", "currency"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
        ];
      };
      invoices: {
        Row: {
          bill_to: NonNullable<Json>;
          branch_id: string;
          branch_name: string;
          created_at: string;
          created_by: string;
          currency: string;
          customer_id: string;
          discarded_at: string | null;
          discount_amount: number;
          due_date: string;
          id: string;
          invoice_number: string | null;
          issue_date: string;
          issued_at: string | null;
          issued_by: string | null;
          issuer: NonNullable<Json>;
          notes: string;
          replaces_invoice_id: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
          version: number;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          bill_to: NonNullable<Json>;
          branch_id: string;
          branch_name: string;
          created_at?: string;
          created_by: string;
          currency?: string;
          customer_id: string;
          discarded_at?: string | null;
          discount_amount?: number;
          due_date: string;
          id?: string;
          invoice_number?: string | null;
          issue_date: string;
          issued_at?: string | null;
          issued_by?: string | null;
          issuer: NonNullable<Json>;
          notes?: string;
          replaces_invoice_id?: string | null;
          state?: string;
          tenant_id: string;
          updated_at?: string;
          version?: number;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          bill_to?: NonNullable<Json>;
          branch_id?: string;
          branch_name?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          customer_id?: string;
          discarded_at?: string | null;
          discount_amount?: number;
          due_date?: string;
          id?: string;
          invoice_number?: string | null;
          issue_date?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          issuer?: NonNullable<Json>;
          notes?: string;
          replaces_invoice_id?: string | null;
          state?: string;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_currency_fkey";
            columns: ["currency"];
            isOneToOne: false;
            referencedRelation: "finance_currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "invoices_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoices_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_tenant_id_replaces_invoice_id_fkey";
            columns: ["tenant_id", "replaces_invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      lead_activities: {
        Row: {
          actor_id: string;
          actor_name: string;
          created_at: string;
          detail: NonNullable<Json>;
          id: string;
          kind: string;
          lead_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          actor_name: string;
          created_at?: string;
          detail?: NonNullable<Json>;
          id?: string;
          kind: string;
          lead_id: string;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          actor_name?: string;
          created_at?: string;
          detail?: NonNullable<Json>;
          id?: string;
          kind?: string;
          lead_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_activities_tenant_id_lead_id_fkey";
            columns: ["tenant_id", "lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      lead_followups: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          description: string;
          id: string;
          kind: string;
          lead_id: string;
          outcome_notes: string | null;
          responsible_employee_id: string;
          scheduled_at: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          kind: string;
          lead_id: string;
          outcome_notes?: string | null;
          responsible_employee_id: string;
          scheduled_at: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          kind?: string;
          lead_id?: string;
          outcome_notes?: string | null;
          responsible_employee_id?: string;
          scheduled_at?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_followups_tenant_id_lead_id_fkey";
            columns: ["tenant_id", "lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "lead_followups_tenant_id_responsible_employee_id_fkey";
            columns: ["tenant_id", "responsible_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      lead_loss_reasons: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_loss_reasons_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_notes: {
        Row: {
          author_id: string;
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          kind: string;
          lead_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          author_name: string;
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          lead_id: string;
          tenant_id: string;
        };
        Update: {
          author_id?: string;
          author_name?: string;
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          lead_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_notes_tenant_id_lead_id_fkey";
            columns: ["tenant_id", "lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      lead_sources: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_sources_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          archived_at: string | null;
          assigned_employee_id: string | null;
          branch_id: string;
          converted_at: string | null;
          converted_by: string | null;
          created_at: string;
          customer_id: string | null;
          email: string | null;
          first_name: string;
          id: string;
          interested_service: string | null;
          last_name: string;
          loss_notes: string | null;
          loss_reason_id: string | null;
          lost_at: string | null;
          lost_by: string | null;
          phone: string;
          phone_normalized: string | null;
          pipeline_id: string;
          priority: string;
          secondary_phone: string | null;
          source_id: string | null;
          stage_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          assigned_employee_id?: string | null;
          branch_id: string;
          converted_at?: string | null;
          converted_by?: string | null;
          created_at?: string;
          customer_id?: string | null;
          email?: string | null;
          first_name: string;
          id?: string;
          interested_service?: string | null;
          last_name?: string;
          loss_notes?: string | null;
          loss_reason_id?: string | null;
          lost_at?: string | null;
          lost_by?: string | null;
          phone: string;
          phone_normalized?: never;
          pipeline_id: string;
          priority?: string;
          secondary_phone?: string | null;
          source_id?: string | null;
          stage_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          assigned_employee_id?: string | null;
          branch_id?: string;
          converted_at?: string | null;
          converted_by?: string | null;
          created_at?: string;
          customer_id?: string | null;
          email?: string | null;
          first_name?: string;
          id?: string;
          interested_service?: string | null;
          last_name?: string;
          loss_notes?: string | null;
          loss_reason_id?: string | null;
          lost_at?: string | null;
          lost_by?: string | null;
          phone?: string;
          phone_normalized?: never;
          pipeline_id?: string;
          priority?: string;
          secondary_phone?: string | null;
          source_id?: string | null;
          stage_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_tenant_id_assigned_employee_id_fkey";
            columns: ["tenant_id", "assigned_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "leads_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "leads_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "leads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_tenant_id_loss_reason_id_fkey";
            columns: ["tenant_id", "loss_reason_id"];
            isOneToOne: false;
            referencedRelation: "lead_loss_reasons";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "leads_tenant_id_pipeline_id_stage_id_fkey";
            columns: ["tenant_id", "pipeline_id", "stage_id"];
            isOneToOne: false;
            referencedRelation: "sales_stages";
            referencedColumns: ["tenant_id", "pipeline_id", "id"];
          },
          {
            foreignKeyName: "leads_tenant_id_source_id_fkey";
            columns: ["tenant_id", "source_id"];
            isOneToOne: false;
            referencedRelation: "lead_sources";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      payment_allocations: {
        Row: {
          amount: number;
          audit_event_id: string;
          created_at: string;
          currency: string;
          customer_id: string;
          id: string;
          invoice_id: string;
          payment_id: string;
          reversal_of: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          audit_event_id: string;
          created_at?: string;
          currency: string;
          customer_id: string;
          id?: string;
          invoice_id: string;
          payment_id: string;
          reversal_of?: string | null;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          audit_event_id?: string;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          id?: string;
          invoice_id?: string;
          payment_id?: string;
          reversal_of?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_allocations_tenant_id_audit_event_id_fkey";
            columns: ["tenant_id", "audit_event_id"];
            isOneToOne: false;
            referencedRelation: "financial_audit_events";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_invoice_id_customer_id_curre_fkey";
            columns: ["tenant_id", "invoice_id", "customer_id", "currency"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["tenant_id", "id", "customer_id", "currency"];
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_payment_id_customer_id_curre_fkey";
            columns: ["tenant_id", "payment_id", "customer_id", "currency"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["tenant_id", "id", "customer_id", "currency"];
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_reversal_of_fkey";
            columns: ["tenant_id", "reversal_of"];
            isOneToOne: false;
            referencedRelation: "payment_allocations";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      payment_refunds: {
        Row: {
          amount: number;
          cashbox_id: string;
          currency: string;
          id: string;
          occurred_at: string;
          payment_id: string;
          tenant_id: string;
          transaction_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          cashbox_id: string;
          currency: string;
          id?: string;
          occurred_at: string;
          payment_id: string;
          tenant_id: string;
          transaction_id: string;
        };
        Update: {
          amount?: number;
          cashbox_id?: string;
          currency?: string;
          id?: string;
          occurred_at?: string;
          payment_id?: string;
          tenant_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_refunds_tenant_id_cashbox_id_currency_fkey";
            columns: ["tenant_id", "cashbox_id", "currency"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
          {
            foreignKeyName: "payment_refunds_tenant_id_payment_id_fkey";
            columns: ["tenant_id", "payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payment_refunds_tenant_id_transaction_id_fkey";
            columns: ["tenant_id", "transaction_id"];
            isOneToOne: true;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          branch_id: string;
          cashbox_id: string;
          created_at: string;
          currency: string;
          customer_id: string;
          customer_name: string;
          external_reference: string;
          id: string;
          method: string;
          notes: string;
          paid_at: string;
          tenant_id: string;
          transaction_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          branch_id: string;
          cashbox_id: string;
          created_at?: string;
          currency: string;
          customer_id: string;
          customer_name: string;
          external_reference?: string;
          id?: string;
          method: string;
          notes?: string;
          paid_at: string;
          tenant_id: string;
          transaction_id: string;
        };
        Update: {
          amount?: number;
          branch_id?: string;
          cashbox_id?: string;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          customer_name?: string;
          external_reference?: string;
          id?: string;
          method?: string;
          notes?: string;
          paid_at?: string;
          tenant_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_branch_id_fkey";
            columns: ["tenant_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payments_tenant_id_cashbox_id_currency_fkey";
            columns: ["tenant_id", "cashbox_id", "currency"];
            isOneToOne: false;
            referencedRelation: "cashboxes";
            referencedColumns: ["tenant_id", "id", "currency"];
          },
          {
            foreignKeyName: "payments_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "payments_tenant_id_transaction_id_fkey";
            columns: ["tenant_id", "transaction_id"];
            isOneToOne: true;
            referencedRelation: "financial_transactions";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      permissions: {
        Row: {
          assignable: boolean;
          description: string;
          key: string;
        };
        ComputedFields: never;
        Insert: {
          assignable?: boolean;
          description: string;
          key: string;
        };
        Update: {
          assignable?: boolean;
          description?: string;
          key?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          phone: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          phone?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          permission: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        ComputedFields: never;
        Insert: {
          permission: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        Update: {
          permission?: string;
          role?: Database["public"]["Enums"]["app_role"];
        };
        Relationships: [];
      };
      sales_configuration_history: {
        Row: {
          actor_id: string;
          after_value: NonNullable<Json>;
          before_value: Json | null;
          created_at: string;
          id: string;
          kind: string;
          record_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          after_value: NonNullable<Json>;
          before_value?: Json | null;
          created_at?: string;
          id?: string;
          kind: string;
          record_id: string;
          tenant_id: string;
        };
        Update: {
          actor_id?: string;
          after_value?: NonNullable<Json>;
          before_value?: Json | null;
          created_at?: string;
          id?: string;
          kind?: string;
          record_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_configuration_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_pipelines: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_pipelines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_stages: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          outcome: string;
          pipeline_id: string;
          position: number;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          outcome?: string;
          pipeline_id: string;
          position: number;
          tenant_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          outcome?: string;
          pipeline_id?: string;
          position?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_stages_tenant_id_pipeline_id_fkey";
            columns: ["tenant_id", "pipeline_id"];
            isOneToOne: false;
            referencedRelation: "sales_pipelines";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      student_guardians: {
        Row: {
          customer_id: string;
          guardian_id: string;
          is_emergency: boolean;
          relationship: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          customer_id: string;
          guardian_id: string;
          is_emergency?: boolean;
          relationship: string;
          tenant_id: string;
        };
        Update: {
          customer_id?: string;
          guardian_id?: string;
          is_emergency?: boolean;
          relationship?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_guardians_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "student_profiles";
            referencedColumns: ["tenant_id", "customer_id"];
          },
          {
            foreignKeyName: "student_guardians_tenant_id_guardian_id_fkey";
            columns: ["tenant_id", "guardian_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      student_profiles: {
        Row: {
          additional_information: string | null;
          created_at: string;
          customer_id: string;
          education_level: string | null;
          education_status: string;
          enrollment_date: string | null;
          learning_goals: string | null;
          school: string | null;
          student_identifier: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          additional_information?: string | null;
          created_at?: string;
          customer_id: string;
          education_level?: string | null;
          education_status?: string;
          enrollment_date?: string | null;
          learning_goals?: string | null;
          school?: string | null;
          student_identifier: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          additional_information?: string | null;
          created_at?: string;
          customer_id?: string;
          education_level?: string | null;
          education_status?: string;
          enrollment_date?: string | null;
          learning_goals?: string | null;
          school?: string | null;
          student_identifier?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_profiles_tenant_id_customer_id_fkey";
            columns: ["tenant_id", "customer_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      tenant_memberships: {
        Row: {
          created_at: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          role_id: string;
          tenant_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          role_id: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          role_id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_memberships_tenant_id_role_id_fkey";
            columns: ["tenant_id", "role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      tenants: {
        Row: {
          address: string;
          business_type: string;
          contact_email: string;
          created_at: string;
          currency: string;
          id: string;
          name: string;
          owner_id: string;
          phone: string;
          slug: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          business_type?: string;
          contact_email?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          name: string;
          owner_id: string;
          phone?: string;
          slug: string;
          timezone?: string;
        };
        Update: {
          address?: string;
          business_type?: string;
          contact_email?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          phone?: string;
          slug?: string;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_owner_membership_fk";
            columns: ["id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "tenant_memberships";
            referencedColumns: ["tenant_id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_employee_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      add_lead_note: {
        Args: {
          p_body: string;
          p_kind?: string;
          p_lead: string;
          p_tenant: string;
        };
        Returns: string;
      };
      allocate_payment: {
        Args: {
          p_amount: string;
          p_invoice: string;
          p_original?: string;
          p_payment: string;
          p_reason?: string;
          p_request: string;
          p_tenant: string;
        };
        Returns: string;
      };
      archive_customer: {
        Args: { p_archive: boolean; p_customer: string; p_tenant: string };
        Returns: undefined;
      };
      archive_employee: {
        Args: { p_employee: string; p_tenant: string };
        Returns: undefined;
      };
      archive_lead: {
        Args: { p_archive: boolean; p_lead: string; p_tenant: string };
        Returns: undefined;
      };
      assign_member_role: {
        Args: {
          p_active?: boolean;
          p_branch_roles?: Json;
          p_branches: string[];
          p_role: string;
          p_tenant: string;
          p_user: string;
        };
        Returns: undefined;
      };
      cashbox_details: {
        Args: {
          p_audit_page?: number;
          p_cashbox: string;
          p_filters?: Json;
          p_page?: number;
          p_tenant: string;
        };
        Returns: Json;
      };
      cashbox_directory: {
        Args: { p_filters?: Json; p_page?: number; p_tenant: string };
        Returns: Json;
      };
      complete_lead_followup: {
        Args: { p_followup: string; p_outcome: string; p_tenant: string };
        Returns: undefined;
      };
      convert_lead: {
        Args: {
          p_confirm_duplicate?: boolean;
          p_customer?: string;
          p_lead: string;
          p_stage?: string;
          p_tenant: string;
        };
        Returns: string;
      };
      create_business: {
        Args: {
          p_address?: string;
          p_branch_name?: string;
          p_business_type?: string;
          p_contact_email?: string;
          p_name: string;
          p_phone?: string;
        };
        Returns: string;
      };
      create_employee_invitation: {
        Args: { p_employee: string; p_role: string; p_tenant: string };
        Returns: string;
      };
      customer_directory: {
        Args: {
          p_archived?: boolean;
          p_branch?: string;
          p_employee?: string;
          p_page?: number;
          p_search?: string;
          p_sort?: string;
          p_status?: string;
          p_students?: boolean;
          p_tag?: string;
          p_tenant: string;
        };
        Returns: {
          archived_at: string;
          branch_ids: string[];
          created_at: string;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
          phone: string;
          responsible_employee_id: string;
          responsible_name: string;
          status_id: string;
          status_name: string;
          student_identifier: string;
          tag_names: string[];
          total_count: number;
        }[];
      };
      customer_duplicate_candidates: {
        Args: {
          p_email?: string;
          p_exclude?: string;
          p_name?: string;
          p_phone?: string;
          p_tenant: string;
        };
        Returns: {
          archived: boolean;
          email: string;
          full_name: string;
          id: string;
          match_reason: string;
          phone: string;
        }[];
      };
      customer_employee_choices: {
        Args: { p_tenant: string };
        Returns: {
          full_name: string;
          id: string;
        }[];
      };
      customer_financial_profile: {
        Args: {
          p_branch?: string;
          p_customer: string;
          p_page?: number;
          p_tenant: string;
        };
        Returns: Json;
      };
      debt_directory: {
        Args: { p_filters?: Json; p_page?: number; p_tenant: string };
        Returns: Json;
      };
      expense_category_directory: { Args: { p_tenant: string }; Returns: Json };
      finance_operation_options: {
        Args: { p_branch?: string; p_kind: string; p_tenant: string };
        Returns: Json;
      };
      finance_payment_options: {
        Args: {
          p_branch: string;
          p_customer?: string;
          p_search?: string;
          p_tenant: string;
        };
        Returns: Json;
      };
      financial_operation_details: {
        Args: { p_id: string; p_kind: string; p_tenant: string };
        Returns: Json;
      };
      financial_operation_directory: {
        Args: {
          p_filters?: Json;
          p_kind: string;
          p_page?: number;
          p_tenant: string;
        };
        Returns: Json;
      };
      financial_transaction_details: {
        Args: { p_tenant: string; p_transaction: string };
        Returns: Json;
      };
      get_employee_salary: {
        Args: { p_employee: string; p_tenant: string };
        Returns: Json;
      };
      invoice_customer_choices: {
        Args: { p_branch: string; p_search?: string; p_tenant: string };
        Returns: {
          id: string;
          name: string;
          phone: string;
        }[];
      };
      invoice_details: {
        Args: { p_audit_page?: number; p_invoice: string; p_tenant: string };
        Returns: Json;
      };
      invoice_directory: {
        Args: { p_filters?: Json; p_page?: number; p_tenant: string };
        Returns: Json;
      };
      lead_directory: {
        Args: {
          p_board?: boolean;
          p_filters?: Json;
          p_page?: number;
          p_tenant: string;
        };
        Returns: Json;
      };
      lead_duplicate_candidates: {
        Args: {
          p_email?: string;
          p_exclude?: string;
          p_phone?: string;
          p_tenant: string;
        };
        Returns: {
          full_name: string;
          id: string;
          phone: string;
          status: string;
        }[];
      };
      list_business_members: {
        Args: { p_tenant: string };
        Returns: {
          branch_ids: string[];
          email: string;
          full_name: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        }[];
      };
      move_lead: {
        Args: {
          p_expected_stage: string;
          p_lead: string;
          p_notes?: string;
          p_reason?: string;
          p_stage: string;
          p_tenant: string;
        };
        Returns: undefined;
      };
      payment_customer_choices: {
        Args: { p_branch: string; p_search?: string; p_tenant: string };
        Returns: {
          id: string;
          name: string;
          phone: string;
        }[];
      };
      payment_details: {
        Args: { p_payment: string; p_tenant: string };
        Returns: Json;
      };
      payment_directory: {
        Args: { p_filters?: Json; p_page?: number; p_tenant: string };
        Returns: Json;
      };
      permission_grants: {
        Args: { p_tenant: string };
        Returns: {
          branch_id: string;
          permission: string;
        }[];
      };
      post_cashbox_entry: {
        Args: {
          p_amount: string;
          p_cashbox: string;
          p_kind: string;
          p_reason: string;
          p_request: string;
          p_tenant: string;
        };
        Returns: string;
      };
      post_cashbox_transfer: {
        Args: {
          p_amount: string;
          p_at: string;
          p_destination: string;
          p_reason: string;
          p_request: string;
          p_source: string;
          p_tenant: string;
        };
        Returns: string;
      };
      post_expense: {
        Args: { p_data: Json; p_request: string; p_tenant: string };
        Returns: string;
      };
      post_payment: {
        Args: {
          p_allocations?: Json;
          p_data: Json;
          p_request: string;
          p_tenant: string;
        };
        Returns: string;
      };
      post_payment_refund: {
        Args: {
          p_amount: string;
          p_at: string;
          p_cashbox: string;
          p_payment: string;
          p_reason: string;
          p_request: string;
          p_tenant: string;
        };
        Returns: string;
      };
      preview_employee_invitation: { Args: { p_token: string }; Returns: Json };
      reorder_sales_stages: {
        Args: { p_pipeline: string; p_stages: string[]; p_tenant: string };
        Returns: undefined;
      };
      reverse_financial_transaction: {
        Args: {
          p_at: string;
          p_reason: string;
          p_request: string;
          p_tenant: string;
          p_transaction: string;
        };
        Returns: string;
      };
      revoke_employee_invitation: {
        Args: { p_employee: string; p_tenant: string };
        Returns: undefined;
      };
      salary_history: {
        Args: { p_employee: string; p_tenant: string };
        Returns: {
          changed_by: string;
          created_at: string;
          employee_id: string;
          id: string;
          new_settings: NonNullable<Json>;
          previous_settings: Json | null;
          reason: string;
          tenant_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "employee_salary_history";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      sales_analytics: {
        Args: { p_filters?: Json; p_tenant: string };
        Returns: Json;
      };
      sales_employee_choices: {
        Args: { p_branch: string; p_tenant: string };
        Returns: {
          full_name: string;
          id: string;
        }[];
      };
      sales_followup_directory: {
        Args: { p_filters?: Json; p_page?: number; p_tenant: string };
        Returns: Json;
      };
      save_business_role: {
        Args: {
          p_id: string;
          p_name: string;
          p_permissions: string[];
          p_scope: string;
          p_tenant: string;
        };
        Returns: string;
      };
      save_cashbox: {
        Args: {
          p_data: Json;
          p_id: string;
          p_request: string;
          p_tenant: string;
        };
        Returns: string;
      };
      save_customer: {
        Args: {
          p_branches: string[];
          p_fields?: Json;
          p_id: string;
          p_profile: Json;
          p_student?: Json;
          p_tags?: string[];
          p_tenant: string;
        };
        Returns: string;
      };
      save_customer_note: {
        Args: {
          p_body: string;
          p_customer: string;
          p_id: string;
          p_kind?: string;
          p_tenant: string;
        };
        Returns: string;
      };
      save_customer_setting: {
        Args: {
          p_active?: boolean;
          p_id: string;
          p_kind: string;
          p_name: string;
          p_tenant: string;
          p_type?: string;
        };
        Returns: string;
      };
      save_employee: {
        Args: {
          p_branches: string[];
          p_email: string;
          p_full_name: string;
          p_id: string;
          p_job_title: string;
          p_notes: string;
          p_phone: string;
          p_start_date: string;
          p_status: string;
          p_tenant: string;
        };
        Returns: string;
      };
      save_employee_salary: {
        Args: {
          p_amount: string;
          p_bonus_amount: string;
          p_bonus_basis: string;
          p_bonus_percentage: string;
          p_currency: string;
          p_employee: string;
          p_percentage: string;
          p_reason: string;
          p_tenant: string;
          p_type: string;
        };
        Returns: undefined;
      };
      save_expense_category: {
        Args: {
          p_active: boolean;
          p_id: string;
          p_name: string;
          p_tenant: string;
          p_version?: number;
        };
        Returns: string;
      };
      save_invoice_draft: {
        Args: {
          p_data: Json;
          p_invoice: string;
          p_items: Json;
          p_request: string;
          p_tenant: string;
          p_version: number;
        };
        Returns: string;
      };
      save_lead: {
        Args: { p_data: Json; p_id: string; p_tenant: string };
        Returns: string;
      };
      save_lead_followup: {
        Args: { p_data: Json; p_id: string; p_lead: string; p_tenant: string };
        Returns: string;
      };
      save_sales_setting: {
        Args: { p_data: Json; p_id: string; p_kind: string; p_tenant: string };
        Returns: string;
      };
      save_student_guardian: {
        Args: {
          p_customer: string;
          p_email: string;
          p_emergency?: boolean;
          p_full_name: string;
          p_guardian: string;
          p_phone: string;
          p_relationship: string;
          p_tenant: string;
        };
        Returns: string;
      };
      set_business_member: {
        Args: {
          p_active?: boolean;
          p_branches?: string[];
          p_email: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_tenant: string;
        };
        Returns: undefined;
      };
      set_cashbox_overdraft: {
        Args: {
          p_allow: boolean;
          p_cashbox: string;
          p_reason: string;
          p_request: string;
          p_tenant: string;
          p_version: number;
        };
        Returns: string;
      };
      transition_invoice: {
        Args: {
          p_action: string;
          p_invoice: string;
          p_reason?: string;
          p_request: string;
          p_tenant: string;
          p_version: number;
        };
        Returns: string;
      };
      unlink_student_guardian: {
        Args: { p_customer: string; p_guardian: string; p_tenant: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role:
        "owner" | "admin" | "manager" | "teacher" | "staff" | "employee";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "manager", "teacher", "staff", "employee"],
    },
  },
} as const;
