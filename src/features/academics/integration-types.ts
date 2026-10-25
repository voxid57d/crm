import type { EnrollmentRow, Directory, TeacherChoice } from "./group-types";
export type LinkedInvoice = {
  id: string;
  invoice_number: string | null;
  state: string;
  issue_date: string;
  due_date?: string;
  currency: string;
  total: string;
  enrollment_id?: string;
  group_name?: string;
};
export type EnrollmentBilling = Directory<LinkedInvoice> & {
  can_view: boolean;
  can_create: boolean;
};
export type StudentEnrollmentRow = EnrollmentRow & {
  group_status: string;
  teachers: string;
};
export type StudentAcademicSummary = {
  active_courses: number;
  active_groups: number;
  historical_enrollments: number;
  activity: Directory<{
    id: string;
    operation: string;
    created_at: string;
    group_id: string;
    enrollment_id: string | null;
    lesson_id: string | null;
    group_name: string;
  }>;
  invoices: Directory<LinkedInvoice>;
};
export type AcademicReportOptions = {
  courses: TeacherChoice[];
  teachers: TeacherChoice[];
};
export type AcademicReport = Directory<{
  id: string;
  name: string;
  branch_name: string;
  course_name: string;
  status: string;
  capacity: number;
  teachers: string;
  reserved_seats: number | null;
  active_enrollments: number | null;
}> & {
  stats: Record<
    | "active_courses"
    | "active_groups"
    | "unique_active_students"
    | "active_enrollments"
    | "teachers"
    | "today_lessons"
    | "upcoming_lessons"
    | "completed_lessons"
    | "near_capacity"
    | "at_capacity"
    | "available_classrooms",
    number
  >;
};
