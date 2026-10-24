import type { Database as GeneratedDatabase } from "./database.types";

// PostgreSQL accepts NULL function arguments. Type generation does not always
// express that for UUID inputs used to distinguish create from update.
type Functions = GeneratedDatabase["public"]["Functions"];
type IdFunction =
  | "save_employee"
  | "save_business_role"
  | "save_customer"
  | "save_customer_note"
  | "save_customer_setting"
  | "save_lead"
  | "save_lead_followup"
  | "save_sales_setting"
  | "save_cashbox"
  | "save_expense_category";
type NullableId<K extends IdFunction> = Omit<Functions[K], "Args"> & {
  Args: Omit<Functions[K]["Args"], "p_id"> & { p_id: string | null };
};
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<
      Functions,
      | IdFunction
      | "save_student_guardian"
      | "save_invoice_draft"
      | "save_student"
    > & {
      [K in IdFunction]: NullableId<K>;
    } & {
      save_student: Omit<Functions["save_student"], "Args"> & {
        Args: Omit<Functions["save_student"]["Args"], "p_customer"> & {
          p_customer: string | null;
        };
      };
      save_invoice_draft: Omit<Functions["save_invoice_draft"], "Args"> & {
        Args: Omit<Functions["save_invoice_draft"]["Args"], "p_invoice"> & {
          p_invoice: string | null;
        };
      };
      save_student_guardian: Omit<
        Functions["save_student_guardian"],
        "Args"
      > & {
        Args: Omit<Functions["save_student_guardian"]["Args"], "p_guardian"> & {
          p_guardian: string | null;
        };
      };
    };
  };
};
export type AppRole = Database["public"]["Enums"]["app_role"];
