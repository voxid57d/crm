import type { AppRole } from "@/lib/supabase/schema";

export const roleLabels: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Branch Manager",
  employee: "Employee",
  teacher: "Teacher (legacy)",
  staff: "Staff (legacy)",
};
