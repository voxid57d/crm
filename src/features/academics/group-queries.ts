import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import { academicFilters, academicPage } from "./queries";
import type { AcademicSearch } from "./types";
import type {
  GroupDetail,
  EnrollmentDetail,
  LmsOptions,
  GroupRow,
  EnrollmentRow,
  Directory,
  StudentChoice,
  TeacherChoice,
} from "./group-types";
type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export function branchGrant(w: Workspace, p: string, b: string) {
  return Boolean(w.branchPermissions.get(b)?.has(p));
}
function checked(error: { code?: string } | null) {
  if (error?.code === "42501") notFound();
  if (error)
    throw new Error(
      "Academic records could not load. Verify filters and local services.",
    );
}
export function businessDate(w: Workspace) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: w.tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const lmsOptions = cache(async () => {
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("lms_options", {
      p_tenant: workspace.tenant.id,
    });
  checked(r.error);
  return { workspace, ...(r.data as unknown as LmsOptions) };
});
export const getGroup = cache(async (id: string, page = 0) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("study_group_details", {
      p_tenant: workspace.tenant.id,
      p_group: id,
      p_history_page: page,
    });
  checked(r.error);
  return { workspace, detail: r.data as unknown as GroupDetail };
});
export const getEnrollment = cache(async (id: string, page = 0) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const workspace = await getWorkspace(),
    r = await workspace.supabase.rpc("student_enrollment_details", {
      p_tenant: workspace.tenant.id,
      p_enrollment: id,
      p_history_page: page,
    });
  checked(r.error);
  return { workspace, detail: r.data as unknown as EnrollmentDetail };
});
export async function groupDirectory(
  search: AcademicSearch,
  defaultBranch = true,
) {
  const workspace = await getWorkspace(),
    filters = academicFilters(search, [
      "q",
      "branch",
      "course",
      "teacher",
      "status",
      "sort",
    ]),
    page = academicPage(search);
  if (defaultBranch && !Object.hasOwn(search, "branch") && workspace.branch)
    filters.branch = workspace.branch.id;
  const r = await workspace.supabase.rpc("group_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  checked(r.error);
  return {
    workspace,
    filters,
    page,
    ...(r.data as unknown as Directory<GroupRow>),
  };
}
export async function enrollmentDirectory(
  search: AcademicSearch,
  defaultBranch = true,
) {
  const workspace = await getWorkspace(),
    filters = academicFilters(search, [
      "q",
      "branch",
      "group",
      "student",
      "status",
      "sort",
    ]),
    page = academicPage(search);
  if (defaultBranch && !Object.hasOwn(search, "branch") && workspace.branch)
    filters.branch = workspace.branch.id;
  const r = await workspace.supabase.rpc("enrollment_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  checked(r.error);
  return {
    workspace,
    filters,
    page,
    ...(r.data as unknown as Directory<EnrollmentRow>),
  };
}
export async function studentChoices(group: string, q: string, page: number) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("group_student_choices", {
      p_tenant: w.tenant.id,
      p_group: group,
      p_q: q.slice(0, 100),
      p_page: page,
    });
  checked(r.error);
  return r.data as unknown as Directory<StudentChoice>;
}
export async function teacherChoices(group: string, q: string, page: number) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("group_teacher_choices", {
      p_tenant: w.tenant.id,
      p_group: group,
      p_q: q.slice(0, 100),
      p_page: page,
    });
  checked(r.error);
  return r.data as unknown as Directory<TeacherChoice>;
}
export async function teacherFilters() {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("group_teacher_filters", {
      p_tenant: w.tenant.id,
    });
  checked(r.error);
  return r.data as unknown as TeacherChoice[];
}
export async function courseGroupSummary(id: string) {
  const w = await getWorkspace(),
    r = await w.supabase.rpc("course_group_summary", {
      p_tenant: w.tenant.id,
      p_course: id,
    });
  checked(r.error);
  return r.data as unknown as {
    groups: number;
    active_groups: number;
    active_enrollments: number;
  };
}
