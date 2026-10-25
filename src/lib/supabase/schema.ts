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
  | "save_expense_category"
  | "save_course"
  | "save_course_setting"
  | "save_study_group"
  | "save_group_schedule"
  | "save_lesson"
  | "save_classroom"
  | "save_academic_closure"
  | "save_schedule_exception";
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
      | "set_group_teachers"
      | "academic_calendar_history"
    > & {
      [K in IdFunction]: NullableId<K>;
    } & {
      academic_calendar_history: Omit<
        Functions["academic_calendar_history"],
        "Args"
      > & {
        Args: Omit<
          Functions["academic_calendar_history"]["Args"],
          "p_closure" | "p_exception"
        > & { p_closure: string | null; p_exception: string | null };
      };
      set_group_teachers: Omit<Functions["set_group_teachers"], "Args"> & {
        Args: Omit<Functions["set_group_teachers"]["Args"], "p_primary"> & {
          p_primary: string | null;
        };
      };
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
