import { getWorkspace } from "@/features/workspace/context";
import { saveBranch } from "@/features/workspace/actions";
import { ActionForm } from "@/components/forms/action-form";
import { BranchFields } from "@/components/forms/branch-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  const {
    tenant,
    branches,
    permissions,
    branchPermissions,
    branch: selected,
  } = await getWorkspace();
  const canCreate = permissions.has("branches.create");
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {tenant.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Branches</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {canCreate
            ? "Manage all branches in this business."
            : "Branches within your assigned scope."}{" "}
          Switch between active authorized branches in the workspace bar.
        </p>
      </div>
      {canCreate && (
        <Card className="max-w-2xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Create a branch</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveBranch} submit="Create branch">
              <BranchFields tenantId={tenant.id} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <Card key={branch.id} className="shadow-none">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{branch.name}</CardTitle>
                <Badge variant={branch.is_active ? "secondary" : "outline"}>
                  {branch.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {selected?.id === branch.id && (
                <p className="text-xs text-primary">Selected branch</p>
              )}
            </CardHeader>
            <CardContent>
              {branchPermissions.get(branch.id)?.has("branches.update") ? (
                <ActionForm action={saveBranch} submit="Save branch">
                  <BranchFields tenantId={tenant.id} branch={branch} />
                </ActionForm>
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd className="mt-1">{branch.address || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="mt-1">{branch.phone || "Not provided"}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {branches.length === 0 && (
        <p className="rounded-xl border border-dashed bg-white p-8 text-sm text-muted-foreground">
          No branches are available within your current access. Ask the Owner to
          review your assignments.
        </p>
      )}
    </div>
  );
}
