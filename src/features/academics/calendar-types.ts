import type { Database } from "@/lib/supabase/database.types";
import type { AcademicHistory } from "./types";
import type { Directory } from "./group-types";
export type Closure =
  Database["public"]["Tables"]["academic_closures"]["Row"] & {
    branch_name: string | null;
    starts_at?: string;
    ends_at?: string;
    can_manage?: boolean;
  };
export type ClosureDetail = {
  closure: Closure;
  can_manage: boolean;
  history: AcademicHistory;
};
export type ClosureImpact = Directory<{
  id: string;
  group_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  group_name: string;
  branch_name: string;
  can_reschedule: boolean;
  has_finalized_attendance: boolean;
}>;
export type ScheduleException =
  Database["public"]["Tables"]["group_schedule_exceptions"]["Row"] & {
    lesson_id: string | null;
  };
export type GenerationSkip = {
  id: string;
  occurrence_date: string;
  reason: string;
  closure_id: string | null;
  exception_id: string | null;
  slot_id: string;
  series_id: string;
};
export type CalendarContext = {
  blocked: boolean;
  has_finalized_attendance: boolean;
  closures: Pick<
    Closure,
    "id" | "name" | "from_date" | "to_date" | "timezone"
  >[];
  cancellation: {
    at: string;
    by: string;
    reason: string;
    previous_status: string;
  } | null;
  latest_change: {
    at: string;
    by: string;
    reason: string;
    operation: string;
  } | null;
};
export type ScheduleChange = {
  id: string;
  lesson_id: string;
  operation: string;
  reason: string;
  actor_name: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  status: string;
  group_name: string;
  branch_name: string;
};
