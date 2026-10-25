import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";
import type {
  AcademicSearch,
  CatalogOptions,
  CourseDetail,
  ClassroomDetail,
  CourseRow,
  ClassroomRow,
} from "./types";
type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export function canViewCourses(w: Workspace) {
  return w.permissions.has("courses.view");
}
export function canManageCourses(w: Workspace) {
  return (
    w.businessPermissions.has("courses.view") &&
    w.businessPermissions.has("courses.manage")
  );
}
export function canClassroom(w: Workspace, permission: string, branch: string) {
  const p = w.branchPermissions.get(branch);
  return Boolean(p?.has("classrooms.view") && p.has(permission));
}
export function queryValue(search: AcademicSearch, key: string) {
  return typeof search[key] === "string" ? search[key] : "";
}
export function academicPage(search: AcademicSearch, key = "page") {
  const n = Number(queryValue(search, key));
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 0;
}
export function academicFilters(search: AcademicSearch, keys: string[]) {
  return Object.fromEntries(
    keys.map((k) => [k, queryValue(search, k)]).filter(([, v]) => v),
  );
}
export const catalogOptions = cache(async () => {
  const w = await getWorkspace();
  if (!canViewCourses(w)) notFound();
  const r = await w.supabase.rpc("course_catalog_options", {
    p_tenant: w.tenant.id,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Course settings could not load.");
  return { workspace: w, ...(r.data as unknown as CatalogOptions) };
});
export const getCourse = cache(async (id: string, historyPage = 0) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const w = await getWorkspace();
  const r = await w.supabase.rpc("course_details", {
    p_tenant: w.tenant.id,
    p_course: id,
    p_history_page: historyPage,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Course could not load.");
  return { workspace: w, detail: r.data as unknown as CourseDetail };
});
export const getClassroom = cache(async (id: string, historyPage = 0) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const w = await getWorkspace();
  const r = await w.supabase.rpc("classroom_details", {
    p_tenant: w.tenant.id,
    p_classroom: id,
    p_history_page: historyPage,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error) throw new Error("Classroom could not load.");
  return { workspace: w, detail: r.data as unknown as ClassroomDetail };
});
export async function courseDirectory(search: AcademicSearch) {
  const options = await catalogOptions(),
    filters = academicFilters(search, [
      "q",
      "status",
      "category",
      "level",
      "pricing_model",
      "sort",
    ]),
    page = academicPage(search);
  const r = await options.workspace.supabase.rpc("course_directory", {
    p_tenant: options.workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  if (r.error)
    throw new Error("Course directory could not load. Check filters.");
  return {
    ...options,
    filters,
    page,
    ...(r.data as unknown as { rows: CourseRow[]; total: number }),
  };
}
export async function classroomDirectory(search: AcademicSearch) {
  const workspace = await getWorkspace();
  if (!workspace.permissions.has("classrooms.view")) notFound();
  const filters = academicFilters(search, ["q", "branch", "status", "sort"]),
    page = academicPage(search);
  if (
    !Object.hasOwn(search, "branch") &&
    workspace.branch &&
    canClassroom(workspace, "classrooms.view", workspace.branch.id)
  )
    filters.branch = workspace.branch.id;
  const r = await workspace.supabase.rpc("classroom_directory", {
    p_tenant: workspace.tenant.id,
    p_filters: filters,
    p_page: page,
  });
  if (r.error?.code === "42501") notFound();
  if (r.error)
    throw new Error("Classroom directory could not load. Check filters.");
  return {
    workspace,
    filters,
    page,
    ...(r.data as unknown as { rows: ClassroomRow[]; total: number }),
  };
}
export function academicDate(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
