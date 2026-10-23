import type { Database as GeneratedDatabase } from "./database.types";

// PostgreSQL accepts NULL function arguments. Type generation does not always
// express that for UUID inputs used to distinguish create from update.
type Functions = GeneratedDatabase["public"]["Functions"];
type NullableId<K extends "save_employee" | "save_business_role"> = Omit<
  Functions[K],
  "Args"
> & {
  Args: Omit<Functions[K]["Args"], "p_id"> & { p_id: string | null };
};
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<Functions, "save_employee" | "save_business_role"> & {
      save_employee: NullableId<"save_employee">;
      save_business_role: NullableId<"save_business_role">;
    };
  };
};
export type AppRole = Database["public"]["Enums"]["app_role"];
