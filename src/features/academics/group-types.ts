import type { Database } from "@/lib/supabase/database.types";
import type { AcademicHistory } from "./types";
export const groupStatuses = [
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived",
] as const;
export const enrollmentStatuses = [
  "pending",
  "active",
  "paused",
  "completed",
  "withdrawn",
  "cancelled",
] as const;
export type TeacherChip = {
  employee_id: string;
  name: string;
  is_primary: boolean;
};
export type StudyGroup = Database["public"]["Tables"]["study_groups"]["Row"] & {
  course_name: string;
  branch_name: string;
  classroom_name: string | null;
  teachers: TeacherChip[];
};
export type GroupRow = Pick<
  StudyGroup,
  | "id"
  | "branch_id"
  | "course_id"
  | "name"
  | "code"
  | "start_date"
  | "end_date"
  | "capacity"
  | "status"
  | "course_name"
  | "branch_name"
> & { reserved_seats: number; active_enrollments: number; teachers: string };
export type GroupDetail = {
  group: StudyGroup;
  counts: {
    reserved_seats: number;
    active_enrollments: number;
    unique_students: number;
    historical_enrollments: number;
  };
  course_active: boolean;
  classroom_active: boolean | null;
  can_update: boolean;
  can_archive: boolean;
  can_assign: boolean;
  can_enroll: boolean;
  can_roster: boolean;
  history: AcademicHistory;
  teacher_history: {
    id: string;
    employee_id: string;
    name: string;
    is_primary: boolean;
    assigned_at: string;
    ended_at: string | null;
    eligible: boolean;
  }[];
};
export type Enrollment = Omit<
  Database["public"]["Tables"]["student_enrollments"]["Row"],
  "agreed_price" | "pricing_model" | "notes"
> & { agreed_price?: string; pricing_model?: string; notes?: string };
export type EnrollmentRow = Pick<
  Enrollment,
  | "id"
  | "group_id"
  | "branch_id"
  | "customer_id"
  | "status"
  | "enrollment_date"
  | "effective_start_date"
  | "effective_end_date"
  | "currency"
> & {
  student_name: string;
  student_identifier: string;
  group_name: string;
  course_name: string;
  branch_name: string;
  can_open_student: boolean;
  agreed_price: string | null;
  pricing_model: string | null;
};
export type EnrollmentDetail = {
  enrollment: Enrollment;
  student: { name: string; identifier: string; can_open: boolean };
  group: StudyGroup;
  can_update: boolean;
  can_withdraw: boolean;
  can_transfer: boolean;
  transferred_to: string | null;
  history: AcademicHistory;
};
export type LmsOptions = {
  courses: {
    id: string;
    name: string;
    is_active: boolean;
    standard_price: string;
    pricing_model: string;
    currency: string;
  }[];
  classrooms: {
    id: string;
    branch_id: string;
    name: string;
    capacity: number;
    is_active: boolean;
  }[];
};
export type StudentChoice = {
  id: string;
  name: string;
  student_identifier: string;
  has_branch: boolean;
};
export type TeacherChoice = { id: string; name: string };
export type Directory<T> = { rows: T[]; total: number };
