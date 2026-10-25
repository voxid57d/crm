import type { Database, Json } from "@/lib/supabase/database.types";
import type { Directory, TeacherChoice } from "./group-types";
import type { Lesson } from "./scheduling-types";
export const attendanceStatuses = [
  "unmarked",
  "present",
  "absent",
  "late",
  "excused",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type AttendanceRow = {
  id: string | null;
  enrollment_id: string;
  customer_id: string;
  is_expected: boolean;
  status: AttendanceStatus;
  notes: string;
  late_minutes: number | null;
  marked_at: string | null;
  name: string;
  student_identifier: string;
  can_open_student: boolean;
};
export type AttendanceSheet =
  Database["public"]["Tables"]["lesson_attendance_sheets"]["Row"];
export type AttendanceDetail = Directory<AttendanceRow> & {
  lesson: Lesson;
  sheet: AttendanceSheet | null;
  counts: Record<"expected" | "excluded" | AttendanceStatus, number>;
  roster_changed: boolean;
  can_manage: boolean;
  can_finalize: boolean | null;
  can_correct: boolean | null;
  history: Directory<{
    id: string;
    operation: string;
    actor_name: string;
    reason: string;
    created_at: string;
    sheet_version: number;
    record_id: string | null;
    student_name: string | null;
    before_data: Json;
    after_data: Json;
  }>;
};
export type AttendanceOptions = {
  my_employee_id: string | null;
  groups: {
    id: string;
    name: string;
    course_id: string;
    course_name: string;
    branch_id: string;
  }[];
  teachers: TeacherChoice[];
  assigned_groups: TeacherChoice[];
};
export type AttendanceLessonRow = Pick<
  Lesson,
  | "id"
  | "group_id"
  | "branch_id"
  | "starts_at"
  | "ends_at"
  | "timezone"
  | "title"
  | "status"
  | "group_name"
  | "course_name"
  | "branch_name"
  | "teacher_name"
  | "classroom_name"
> & {
  sheet_id: string | null;
  attendance_state: "draft" | "finalized" | null;
  finalized_at: string | null;
  expected: number | null;
  unmarked: number | null;
  can_manage: boolean;
};
export type AttendanceHistoryRow = {
  id: string;
  lesson_id: string;
  customer_id: string;
  enrollment_id: string;
  status: AttendanceStatus;
  notes: string;
  late_minutes: number | null;
  marked_at: string | null;
  is_expected: boolean;
  sheet_state: string;
  starts_at: string;
  ends_at: string;
  lesson_status: string;
  group_name: string;
  course_name: string;
  branch_name: string;
  teacher_name: string;
  student_name: string;
  student_identifier: string;
  can_open_student: boolean;
};
