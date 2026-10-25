import type { Database, Json } from "@/lib/supabase/database.types";
export type Course = Omit<
  Database["public"]["Tables"]["courses"]["Row"],
  "standard_price"
> & {
  standard_price: string;
  category_name: string | null;
  level_name: string | null;
};
export type CourseRow = Omit<Course, "tenant_id" | "created_by">;
export type Classroom = Database["public"]["Tables"]["classrooms"]["Row"] & {
  branch_name: string;
};
export type ClassroomRow = Omit<Classroom, "tenant_id" | "created_by"> & {
  branch_active: boolean;
};
export type CatalogSetting = {
  id: string;
  name: string;
  is_active: boolean;
  version: number;
};
export type CatalogOptions = {
  categories: CatalogSetting[];
  levels: CatalogSetting[];
};
export type AcademicKind = "course" | "classroom" | "category" | "level";
export type AcademicEvent = {
  id: string;
  operation: string;
  actor_name: string;
  reason: string;
  before_data: Json;
  after_data: Json;
  created_at: string;
};
export type AcademicHistory = { rows: AcademicEvent[]; total: number };
export type CourseDetail = {
  course: Course;
  can_manage: boolean;
  category_active: boolean | null;
  level_active: boolean | null;
  history: AcademicHistory;
};
export type ClassroomDetail = {
  classroom: Classroom;
  can_manage: boolean;
  branch_active: boolean;
  history: AcademicHistory;
};
export type AcademicSearch = Record<string, string | string[] | undefined>;
export const pricingModels = {
  fixed_course: "Fixed course fee",
  monthly: "Monthly tuition",
  per_lesson: "Per-lesson fee",
};
export const durationUnits = {
  days: "Days",
  weeks: "Weeks",
  months: "Months",
  lessons: "Lessons",
};
