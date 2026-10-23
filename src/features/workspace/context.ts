import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { InputError } from "@/lib/validation.mjs";
import type { Database } from "@/lib/supabase/schema";

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Branch = Database["public"]["Tables"]["branches"]["Row"];

export const getBusinesses = cache(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .order("name");
  if (error)
    throw new Error(
      "Could not load businesses. Check local services and migrations.",
    );
  return data;
});

export const getWorkspace = cache(async () => {
  const { user, supabase } = await requireUser();
  const store = await cookies();
  const tenantId = store.get("forma-tenant")?.value;
  const businesses = await getBusinesses();
  const tenant = businesses.find((business) => business.id === tenantId);
  if (!tenant) redirect("/businesses");
  const [membership, branchResult] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single(),
    supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("name"),
  ]);
  if (membership.error) redirect("/businesses");
  if (branchResult.error)
    throw new Error("Could not load branches. Check local migrations.");
  const { data: permissionRows, error: permissionsError } = await supabase.rpc(
    "permission_grants",
    { p_tenant: tenant.id },
  );
  if (permissionsError) throw new Error("Could not verify role permissions.");
  const { data: role, error: roleError } = await supabase
    .from("business_roles")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", membership.data.role_id)
    .single();
  if (roleError)
    throw new Error("Role could not load. Apply local migrations.");
  const branches = branchResult.data;
  const branchId = store.get("forma-branch")?.value;
  const branch =
    branches.find((item) => item.id === branchId && item.is_active) ?? null;
  // Cookies are preferences, never authority. Invalid/inactive branch context
  // requires explicit reselection rather than silently changing write scope.
  if (branchId && !branch) redirect("/businesses?notice=branch-unavailable");
  let roleName = role.name;
  if (branch && role.scope === "branch") {
    const assignment = await supabase
      .from("branch_memberships")
      .select("role_id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .eq("branch_id", branch.id)
      .maybeSingle();
    if (assignment.error)
      throw new Error("Selected branch role could not load.");
    if (assignment.data?.role_id) {
      const branchRole = await supabase
        .from("business_roles")
        .select("name")
        .eq("tenant_id", tenant.id)
        .eq("id", assignment.data.role_id)
        .single();
      if (branchRole.error)
        throw new Error("Selected branch role could not load.");
      roleName = branchRole.data.name;
    }
  }
  return {
    user,
    supabase,
    businesses,
    tenant,
    branches,
    branch,
    membership: membership.data,
    roleName,
    businessPermissions: new Set(
      permissionRows
        .filter((item) => !item.branch_id)
        .map((item) => item.permission),
    ),
    branchPermissions: new Map(
      branches.map((branch) => [
        branch.id,
        new Set(
          permissionRows
            .filter((item) => item.branch_id === branch.id)
            .map((item) => item.permission),
        ),
      ]),
    ),
    permissions: new Set(permissionRows.map((item) => item.permission)),
  };
});

export function assertPermission(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  permission: string,
  branchId?: string,
) {
  if (
    !(branchId
      ? workspace.branchPermissions.get(branchId)?.has(permission)
      : workspace.businessPermissions.has(permission))
  )
    throw new InputError("Your role does not allow this action.");
  if (
    branchId &&
    !workspace.branches.some(
      (branch) =>
        branch.id === branchId && branch.tenant_id === workspace.tenant.id,
    )
  )
    throw new InputError("This branch is outside your authorized scope.");
}
