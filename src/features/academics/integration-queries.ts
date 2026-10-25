import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { getStudent } from "@/features/customers/queries";
import { uuid } from "@/lib/validation.mjs";
import { academicFilters, academicPage, queryValue } from "./queries";
import { businessDate } from "./group-queries";
import { addDays } from "./calendar.mjs";
import type { AcademicSearch } from "./types";
import type { Directory } from "./group-types";
import type { LessonRow } from "./scheduling-types";
import type {
  EnrollmentBilling,
  StudentAcademicSummary,
  StudentEnrollmentRow,
  AcademicReport,
  AcademicReportOptions,
} from "./integration-types";
function checked(error: { code?: string } | null) {
  if (error?.code === "42501") notFound();
  if (error)
    throw new Error(
      "Academic integration could not load. Check access, date filters and local services.",
    );
}
export const enrollmentBilling = cache(async (enrollment: string, page = 0) => {
  const w = await getWorkspace();
  try {
    uuid(enrollment);
  } catch {
    notFound();
  }
  const r = await w.supabase.rpc("enrollment_billing_details", {
    p_tenant: w.tenant.id,
    p_enrollment: enrollment,
    p_page: page,
  });
  checked(r.error);
  return r.data as unknown as EnrollmentBilling;
});
export async function invoiceEnrollmentSource(invoice: string) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("invoice_enrollment_source", {
      p_tenant: w.tenant.id,
      p_invoice: invoice,
    });
  checked(r.error);
  return r.data as unknown as {
    enrollment_id: string;
    group_name: string;
  } | null;
}
export async function studentAcademicSummary(
  student: string,
  page = 0,
  invoicePage = 0,
) {
  const { workspace: w } = await getStudent(student),
    r = await w.supabase.rpc("student_academic_summary", {
      p_tenant: w.tenant.id,
      p_student: student,
      p_page: page,
      p_invoice_page: invoicePage,
    });
  checked(r.error);
  return r.data as unknown as StudentAcademicSummary;
}
export async function studentEnrollments(
  student: string,
  page: number,
  status: string,
) {
  const { workspace: w } = await getStudent(student),
    r = await w.supabase.rpc("student_enrollment_directory", {
      p_tenant: w.tenant.id,
      p_student: student,
      p_page: page,
      p_status: status,
    });
  checked(r.error);
  return r.data as unknown as Directory<StudentEnrollmentRow>;
}
export async function studentLessons(
  student: string,
  search: AcademicSearch,
  calendar = false,
) {
  const { workspace: w } = await getStudent(student),
    filters = academicFilters(search, ["from", "to", "status"]),
    page = academicPage(search);
  filters.from ??= businessDate(w);
  filters.to ??= addDays(filters.from, 30);
  const r = await w.supabase.rpc("student_lesson_directory", {
    p_tenant: w.tenant.id,
    p_student: student,
    p_filters: filters,
    p_page: page,
    p_calendar: calendar,
  });
  checked(r.error);
  return {
    filters,
    page,
    ...(r.data as unknown as Directory<LessonRow> & { page_size: number }),
  };
}
export async function academicReport(search: AcademicSearch) {
  const workspace = await getWorkspace(),
    page = academicPage(search),
    filters = academicFilters(search, [
      "branch",
      "course",
      "teacher",
      "from",
      "to",
      "capacity",
    ]);
  if (!Object.hasOwn(search, "branch") && workspace.branch)
    filters.branch = workspace.branch.id;
  filters.from ??= businessDate(workspace);
  filters.to ??= addDays(filters.from, 30);
  // Invalid calendar dates are rejected by PostgreSQL, never converted to another date.
  for (const key of ["from", "to"])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key])) notFound();
  const [report, options] = await Promise.all([
    workspace.supabase.rpc("academic_overview", {
      p_tenant: workspace.tenant.id,
      p_filters: filters,
      p_page: page,
    }),
    workspace.supabase.rpc("academic_report_options", {
      p_tenant: workspace.tenant.id,
    }),
  ]);
  checked(report.error);
  checked(options.error);
  return {
    workspace,
    filters,
    page,
    report: report.data as unknown as AcademicReport,
    options: options.data as unknown as AcademicReportOptions,
  };
}
export function enrollmentStatus(search: AcademicSearch) {
  const value = queryValue(search, "enrollment_status") || "all";
  return [
    "all",
    "open",
    "pending",
    "active",
    "paused",
    "completed",
    "withdrawn",
    "cancelled",
  ].includes(value)
    ? value
    : "all";
}
