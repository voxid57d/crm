import Link from "next/link";
import { getWorkspace } from "@/features/workspace/context";
import { saveMember } from "@/features/workspace/actions";
import { ActionForm } from "@/components/forms/action-form";
import { MemberFields } from "@/components/forms/member-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Team & access" };
export default async function TeamPage() {
  const workspace = await getWorkspace();
  const { tenant, branches, supabase } = workspace;
  if (!workspace.businessPermissions.has("members.read"))
    return (
      <div className="rounded-xl border bg-white p-8">
        <h1 className="text-2xl font-semibold">Team access is restricted</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Your role does not permit viewing the business team.
        </p>
      </div>
    );
  const [members, memberships, roles] = await Promise.all([
    supabase.rpc("list_business_members", { p_tenant: tenant.id }),
    supabase.from("tenant_memberships").select("*").eq("tenant_id", tenant.id),
    supabase.from("business_roles").select("*").eq("tenant_id", tenant.id),
  ]);
  if (members.error || memberships.error || roles.error)
    throw new Error("Team records could not load.");
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {tenant.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Team & access</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Manage account access separately from employment records.
          Branch-specific roles are configured in{" "}
          <Link href="/roles" className="text-primary underline">
            Roles & permissions
          </Link>
          .
        </p>
      </div>
      {tenant.owner_id === workspace.user.id && (
        <Card className="max-w-2xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">
              Enroll an existing registered account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm leading-6 text-muted-foreground">
              For an employee, prefer the email-bound invitation from their
              employee profile. This option preserves explicit Owner enrollment
              of registered accounts without employment records.
            </p>
            <ActionForm action={saveMember} submit="Add registered member">
              <MemberFields tenantId={tenant.id} branches={branches} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {members.data.map((member) => {
          const membership = memberships.data.find(
            (m) => m.user_id === member.user_id,
          );
          const role = roles.data.find((r) => r.id === membership?.role_id);
          return (
            <Card key={member.user_id} className="shadow-none">
              <CardHeader>
                <CardTitle className="break-all text-base">
                  {member.full_name || member.email}
                </CardTitle>
                <p className="break-all text-xs text-muted-foreground">
                  {member.email}
                </p>
              </CardHeader>
              <CardContent>
                <Badge variant={member.is_active ? "secondary" : "outline"}>
                  {member.is_active
                    ? (role?.name ?? "Unknown role")
                    : "Suspended"}
                </Badge>
                <p className="mt-3 text-sm text-muted-foreground">
                  {role?.scope === "business"
                    ? "All business branches"
                    : member.branch_ids
                        .map((id) => branches.find((b) => b.id === id)?.name)
                        .filter(Boolean)
                        .join(" · ") || "No branch assignments"}
                </p>
                {workspace.businessPermissions.has("roles.manage") &&
                  member.user_id !== tenant.owner_id && (
                    <Link
                      href="/roles#assignments"
                      className="mt-4 block text-sm text-primary underline"
                    >
                      Edit account and branch roles
                    </Link>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
