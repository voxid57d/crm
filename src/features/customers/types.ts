import type { Database } from "@/lib/supabase/schema";
type Tables = Database["public"]["Tables"];
export type Customer = Tables["customers"]["Row"];
export type Student = Tables["student_profiles"]["Row"];
export type CustomerStatus = Tables["customer_statuses"]["Row"];
export type CustomerTag = Tables["customer_tags"]["Row"];
export type CustomField = Tables["customer_field_definitions"]["Row"];
export type Guardian = Tables["guardians"]["Row"];
export type CustomerNote = Tables["customer_notes"]["Row"];
export type Activity = Tables["customer_activities"]["Row"];
export type DuplicateState = {
  error?: string;
  matches?: {
    id: string;
    full_name: string;
    phone: string;
    match_reason: string;
    archived: boolean;
  }[];
};
