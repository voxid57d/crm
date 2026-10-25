import type { Database } from "@/lib/supabase/database.types";
import type { AcademicHistory } from "./types";
import type { StudyGroup, Directory, TeacherChoice } from "./group-types";
export const lessonStatuses = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "rescheduled",
] as const;
export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export type WeeklySlot =
  Database["public"]["Tables"]["group_schedule_slots"]["Row"] & {
    teacher_name: string;
    classroom_name: string | null;
    group_name: string;
    branch_name: string;
  };
export type SlotRow = Pick<
  WeeklySlot,
  | "id"
  | "series_id"
  | "weekday"
  | "start_time"
  | "end_time"
  | "timezone"
  | "effective_from"
  | "effective_to"
  | "teacher_id"
  | "classroom_id"
  | "is_active"
  | "version"
  | "teacher_name"
  | "classroom_name"
>;
export type SlotDetail = {
  slot: WeeklySlot;
  can_manage: boolean;
  can_revise: boolean;
  replacement_id: string | null;
  future_lessons: number;
  teacher_eligible: boolean;
  history: AcademicHistory;
};
export type Lesson = Database["public"]["Tables"]["lessons"]["Row"] & {
  group_name: string;
  course_id: string;
  course_name: string;
  branch_name: string;
  teacher_name: string;
  substitute_name: string | null;
  classroom_name: string | null;
};
export type LessonRow = Pick<
  Lesson,
  | "id"
  | "group_id"
  | "branch_id"
  | "course_id"
  | "starts_at"
  | "ends_at"
  | "timezone"
  | "teacher_id"
  | "substitute_id"
  | "effective_teacher_id"
  | "classroom_id"
  | "title"
  | "status"
  | "group_name"
  | "course_name"
  | "branch_name"
  | "teacher_name"
  | "substitute_name"
  | "classroom_name"
>;
export type LessonDetail = {
  lesson: Lesson;
  can_manage: boolean;
  can_edit: boolean;
  can_start: boolean;
  can_complete: boolean;
  can_cancel: boolean;
  can_roster: boolean;
  can_open_group: boolean;
  teacher_eligible: boolean;
  replacement_id: string | null;
  history: AcademicHistory;
};
export type SchedulingOptions = {
  group: StudyGroup;
  can_schedule: boolean;
  can_lesson: boolean;
  teachers: TeacherChoice[];
  substitutes: TeacherChoice[];
  classrooms: {
    id: string;
    name: string;
    capacity: number;
    is_active: boolean;
  }[];
};
export type TimetableOptions = {
  groups: {
    id: string;
    name: string;
    branch_id: string;
    course_id: string;
    course_name: string;
    status: string;
    can_create: boolean;
  }[];
  teachers: TeacherChoice[];
  classrooms: { id: string; name: string; branch_id: string }[];
};
export type ExpectedRoster = Directory<{
  enrollment_id: string;
  customer_id: string;
  name: string;
  student_identifier: string;
  can_open_student: boolean;
}> & { captured_at: string | null };
export type GenerationBatch = Omit<
  Database["public"]["Tables"]["lesson_generation_batches"]["Row"],
  "created_by" | "tenant_id"
>;
