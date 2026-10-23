import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid, InputError } from "@/lib/validation.mjs";

export const salesOptions = cache(async () => {
  const workspace = await getWorkspace();
  const [pipelines, stages, sources, reasons] = await Promise.all([
    workspace.supabase
      .from("sales_pipelines")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("name"),
    workspace.supabase
      .from("sales_stages")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("position")
      .order("id"),
    workspace.supabase
      .from("lead_sources")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("name"),
    workspace.supabase
      .from("lead_loss_reasons")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("name"),
  ]);
  if (pipelines.error || stages.error || sources.error || reasons.error)
    throw new Error(
      "Sales configuration could not load. Check local migrations.",
    );
  const pairs = await Promise.all(
    workspace.branches.map(async (b) => {
      const result = await workspace.supabase.rpc("sales_employee_choices", {
        p_tenant: workspace.tenant.id,
        p_branch: b.id,
      });
      if (result.error)
        throw new Error("Sales employee choices could not load.");
      return [b.id, result.data] as const;
    }),
  );
  return {
    workspace,
    pipelines: pipelines.data,
    stages: stages.data,
    sources: sources.data,
    reasons: reasons.data,
    employeeChoices: Object.fromEntries(pairs),
  };
});
export const getLead = cache(async (id: string) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const options = await salesOptions();
  const { workspace } = options;
  const result = await workspace.supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", workspace.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (result.error)
    throw new Error(
      "Lead could not load. Check local services and permissions.",
    );
  if (!result.data) notFound();
  return { ...options, lead: result.data };
});
export type Search = Record<string, string | string[] | undefined>;
export function salesFilters(search: Search, defaultBranch?: string | null) {
  const result: Record<string, string> = {};
  for (const key of [
    "q",
    "branch",
    "pipeline",
    "stage",
    "source",
    "employee",
    "priority",
    "from",
    "until",
    "state",
    "archived",
  ]) {
    const v = search[key];
    if (typeof v === "string" && v.length) result[key] = v.trim();
  }
  if (!("branch" in result) && defaultBranch) result.branch = defaultBranch;
  if (result.branch === "all") delete result.branch;
  for (const key of ["branch", "pipeline", "stage", "source", "employee"])
    if (result[key] && result[key] !== "unassigned") uuid(result[key]);
  for (const key of ["from", "until"])
    if (result[key] && !/^\d{4}-\d{2}-\d{2}$/.test(result[key]))
      throw new InputError("Use valid date filters.");
  if (result.from && result.until && result.from > result.until)
    throw new InputError("Start date must be before end date.");
  result.q = (result.q ?? "").slice(0, 100);
  return result;
}
export function pageNumber(value: string | string[] | undefined) {
  return Math.min(
    100000,
    Math.max(0, typeof value === "string" ? parseInt(value, 10) || 0 : 0),
  );
}
