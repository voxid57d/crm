import Link from "next/link";
import { getWorkspace } from "@/features/workspace/context";
import { saveRole, assignRole } from "@/features/employees/actions";
import { RoleFields, MemberRoleFields } from "@/components/forms/role-fields";
import { ActionForm } from "@/components/forms/action-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Roles & permissions" };
export default async function RolesPage() {
  const workspace = await getWorkspace();
  if (!workspace.businessPermissions.has("roles.manage"))
    return (
      <p role="alert">Business-wide role management permission is required.</p>
    );
  const [roles, catalog, grants, members, assignments, identities] =
    await Promise.all([
      workspace.supabase
        .from("business_roles")
        .select("*")
        .eq("tenant_id", workspace.tenant.id)
        .order("name"),
      workspace.supabase
        .from("permissions")
        .select("*")
        .eq("assignable", true)
        .order("key"),
      workspace.supabase
        .from("business_role_permissions")
        .select("*")
        .eq("tenant_id", workspace.tenant.id),
      workspace.supabase
        .from("tenant_memberships")
        .select("*")
        .eq("tenant_id", workspace.tenant.id),
      workspace.supabase
        .from("branch_memberships")
        .select("*")
        .eq("tenant_id", workspace.tenant.id),
      workspace.businessPermissions.has("members.read")
        ? workspace.supabase.rpc("list_business_members", {
            p_tenant: workspace.tenant.id,
          })
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    roles.error ||
    catalog.error ||
    grants.error ||
    members.error ||
    assignments.error ||
    identities.error
  )
    throw new Error(
      "Role configuration could not load. Apply local migrations.",
    );
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {workspace.tenant.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Roles & permissions</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Configure real access boundaries. System roles are fixed; custom
          grants cannot exceed your own permissions. Ownership is protected.
        </p>
      </div>
      <Card className="max-w-4xl shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Create custom role</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveRole} submit="Create role">
            <RoleFields
              tenantId={workspace.tenant.id}
              permissions={catalog.data}
            />
          </ActionForm>
        </CardContent>
      </Card>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Business roles</h2>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {roles.data.map((role) => (
            <Card key={role.id} className="shadow-none">
              <CardHeader>
                <div className="flex justify-between gap-3">
                  <CardTitle className="text-base">{role.name}</CardTitle>
                  <Badge variant="secondary">{role.scope}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {role.system_key ? (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">
                      System role · permissions are read-only
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {grants.data
                        .filter((g) => g.role_id === role.id)
                        .map((g) => (
                          <Badge
                            key={g.permission}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {g.permission}
                          </Badge>
                        ))}
                    </div>
                  </>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      Edit permission configuration
                    </summary>
                    <div className="mt-4">
                      <ActionForm action={saveRole} submit="Save role">
                        <RoleFields
                          tenantId={workspace.tenant.id}
                          permissions={catalog.data}
                          role={role}
                          selected={grants.data
                            .filter((g) => g.role_id === role.id)
                            .map((g) => g.permission)}
                        />
                      </ActionForm>
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section id="assignments">
        <h2 className="mb-2 text-lg font-semibold">
          Account role and branch assignments
        </h2>
        <p className="mb-5 text-sm leading-6 text-muted-foreground">
          Employee records do not require accounts. The Owner can link an
          account through the{" "}
          <Link href="/employees" className="text-primary underline">
            employee invitation workflow
          </Link>
          . Different branch roles apply independently.
        </p>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {members.data.map((member) => {
            const identity = identities.data.find(
              (p) => p.user_id === member.user_id,
            );
            const scoped = assignments.data.filter(
              (a) => a.user_id === member.user_id,
            );
            return (
              <Card key={member.user_id} className="shadow-none">
                <CardHeader>
                  <CardTitle className="break-all text-base">
                    {identity?.full_name || identity?.email || member.user_id}
                  </CardTitle>
                  <p className="break-all text-xs text-muted-foreground">
                    {identity?.email}
                  </p>
                </CardHeader>
                <CardContent>
                  {member.user_id === workspace.tenant.owner_id ? (
                    <p className="text-sm text-muted-foreground">
                      Owner · all business branches. This membership cannot be
                      reassigned or suspended.
                    </p>
                  ) : (
                    <ActionForm
                      action={assignRole}
                      submit="Save role assignments"
                    >
                      <MemberRoleFields
                        tenantId={workspace.tenant.id}
                        userId={member.user_id}
                        roleId={member.role_id}
                        roles={roles.data}
                        branches={workspace.branches}
                        branchIds={scoped.map((a) => a.branch_id)}
                        overrides={Object.fromEntries(
                          scoped.map((a) => [a.branch_id, a.role_id]),
                        )}
                        active={member.is_active}
                      />
                    </ActionForm>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
