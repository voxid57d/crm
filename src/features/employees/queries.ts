import "server-only";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";

export { allScopes } from "@/features/workspace/context";
export async function getEmployee(id: string) {
  const workspace = await getWorkspace();
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const result = await workspace.supabase
    .from("employees")
    .select("*")
    .eq("tenant_id", workspace.tenant.id)
    .eq("id", id)
    .single();
  if (result.error?.code === "PGRST116" || (!result.data && !result.error))
    notFound();
  if (result.error)
    throw new Error(
      "Employee could not load. Check local migrations and access.",
    );
  const assignments = await workspace.supabase
    .from("employee_branches")
    .select("branch_id")
    .eq("tenant_id", workspace.tenant.id)
    .eq("employee_id", id);
  if (assignments.error)
    throw new Error("Employee branch assignments could not load.");
  return {
    workspace,
    employee: result.data,
    branchIds: assignments.data.map((row) => row.branch_id),
  };
}
