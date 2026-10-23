import Link from "next/link";
import { getEmployee, allScopes } from "@/features/employees/queries";
import {
  inviteEmployee,
  revokeInvitation,
  saveSalary,
  archiveEmployee,
} from "@/features/employees/actions";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField } from "@/components/forms/field";
import { SalaryFields } from "@/components/forms/salary-fields";
import { SalarySummary } from "@/components/employees/salary-summary";
import { salaryConfig } from "@/features/employees/parsers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Employee profile" };
export default async function EmployeeProfile({
  params,
  searchParams,
}: {
  params: Promise<{ employee: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { employee: id } = await params;
  const { workspace, employee, branchIds } = await getEmployee(id);
  const { saved } = await searchParams;
  const salaryAllowed = allScopes(workspace, branchIds, "salaries.view");
  const salary = salaryAllowed
    ? await workspace.supabase.rpc("get_employee_salary", {
        p_tenant: workspace.tenant.id,
        p_employee: id,
      })
    : null;
  const history =
    salaryAllowed && !salary?.error
      ? await workspace.supabase.rpc("salary_history", {
          p_tenant: workspace.tenant.id,
          p_employee: id,
        })
      : null;
  const roles =
    workspace.tenant.owner_id === workspace.user.id
      ? await workspace.supabase
          .from("business_roles")
          .select("*")
          .eq("tenant_id", workspace.tenant.id)
          .order("name")
      : null;
  if (roles?.error || salary?.error || history?.error)
    throw new Error(
      "Employee settings could not load. Check local services and permissions.",
    );
  const configuration = salaryConfig(salary?.data ?? null);
  const events = (history?.data ?? []).map((event) => {
    const next = salaryConfig(event.new_settings);
    if (!next) throw new Error("Invalid salary audit response.");
    return {
      ...event,
      previous_settings: salaryConfig(event.previous_settings),
      new_settings: next,
    };
  });
  const format = (date: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: workspace.tenant.timezone,
    }).format(new Date(date));
  return (
    <div className="space-y-6">
      {saved && (
        <p
          role="status"
          className="rounded-xl border bg-secondary p-4 text-sm text-primary"
        >
          Employee record and branch assignments saved.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            EMPLOYEE PROFILE
          </p>
          <h1 className="mt-3 break-words text-3xl font-semibold">
            {employee.full_name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {employee.job_title || "No job title"}
          </p>
          <Badge
            className="mt-3"
            variant={employee.status === "active" ? "secondary" : "outline"}
          >
            {employee.status}
          </Badge>
        </div>
        {allScopes(workspace, branchIds, "employees.update") && (
          <Button asChild variant="outline">
            <Link href={`/employees/${id}/edit`}>Edit profile & branches</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Employment details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{employee.phone || "Not provided"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{employee.email || "Not provided"}</dd>
              <dt className="text-muted-foreground">Start date</dt>
              <dd>{employee.start_date}</dd>
              <dt className="text-muted-foreground">Branches</dt>
              <dd>
                {branchIds
                  .map(
                    (branch) =>
                      workspace.branches.find((b) => b.id === branch)?.name,
                  )
                  .join(" · ") || "Unassigned"}
              </dd>
              <dt className="text-muted-foreground">CRM account</dt>
              <dd>
                {employee.user_id ? "Linked account" : "No login required"}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{format(employee.created_at)}</dd>
              <dt className="text-muted-foreground">Last modified</dt>
              <dd>{format(employee.updated_at)}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {employee.notes || "No notes recorded."}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="max-w-3xl shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Salary configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {!salaryAllowed ? (
            <p className="text-sm text-muted-foreground">
              Salary information is restricted. Its configuration is not
              included in this page or directory data.
            </p>
          ) : (
            <>
              {configuration ? (
                <div className="mb-5">
                  <SalarySummary config={configuration} />
                </div>
              ) : (
                <p className="mb-5 text-sm text-muted-foreground">
                  No salary configuration recorded.
                </p>
              )}
              {employee.status !== "archived" &&
                allScopes(workspace, branchIds, "salaries.manage") && (
                  <ActionForm
                    action={saveSalary}
                    submit="Save salary configuration"
                  >
                    <SalaryFields
                      tenantId={workspace.tenant.id}
                      employeeId={id}
                      currency={workspace.tenant.currency}
                      config={configuration}
                    />
                  </ActionForm>
                )}
              <h3 className="mb-3 mt-7 text-sm font-semibold">
                Change history
              </h3>
              <div className="space-y-3">
                {events.map((event) => (
                  <details key={event.id} className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm">
                      {format(event.created_at)} · {event.reason}
                    </summary>
                    <p className="mt-2 break-all text-xs text-muted-foreground">
                      Changed by account {event.changed_by}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold">
                          Previous settings
                        </p>
                        <div className="mt-3">
                          <SalarySummary config={event.previous_settings} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">New settings</p>
                        <div className="mt-3">
                          <SalarySummary config={event.new_settings} />
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
                {events.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No salary changes yet.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {roles && (
        <Card className="max-w-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">CRM access invitation</CardTitle>
          </CardHeader>
          <CardContent>
            {employee.user_id ? (
              <p className="text-sm text-muted-foreground">
                This employee is already linked to an account. Manage its role
                and branch-specific permissions in{" "}
                <Link href="/roles" className="text-primary underline">
                  Roles & permissions
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm leading-6 text-muted-foreground">
                  Generate an email-bound link and share it with this employee.
                  They can use an existing account or register with the same
                  email. Creating a link does not create an Auth user or send
                  email.
                </p>
                {employee.status === "active" && employee.email && (
                  <ActionForm
                    action={inviteEmployee}
                    submit="Generate invitation link"
                  >
                    <input
                      type="hidden"
                      name="tenant_id"
                      value={workspace.tenant.id}
                    />
                    <input type="hidden" name="employee_id" value={id} />
                    <SelectField
                      label="Role granted on acceptance"
                      name="role_id"
                      defaultValue={
                        roles.data.find((r) => r.system_key === "employee")?.id
                      }
                    >
                      {roles.data
                        .filter(
                          (r) =>
                            r.system_key !== "owner" &&
                            r.system_key !== "staff",
                        )
                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name} —{" "}
                            {role.scope === "business"
                              ? "all business branches"
                              : "assigned branches"}
                          </option>
                        ))}
                    </SelectField>
                  </ActionForm>
                )}
                <ActionForm
                  action={revokeInvitation}
                  submit="Revoke outstanding links"
                  className="mt-4 space-y-3"
                >
                  <input
                    type="hidden"
                    name="tenant_id"
                    value={workspace.tenant.id}
                  />
                  <input type="hidden" name="employee_id" value={id} />
                </ActionForm>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {employee.status !== "archived" &&
        allScopes(workspace, branchIds, "employees.archive") && (
          <Card className="max-w-3xl shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Archive employee</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm leading-6 text-muted-foreground">
                Keep the employee record, branch assignments and salary history,
                and block their CRM access in this business. Authorized profile
                editors can restore the record later.
              </p>
              <ActionForm action={archiveEmployee} submit="Archive employee">
                <input
                  type="hidden"
                  name="tenant_id"
                  value={workspace.tenant.id}
                />
                <input type="hidden" name="employee_id" value={id} />
              </ActionForm>
            </CardContent>
          </Card>
        )}
      <Link
        href="/employees"
        className="inline-block text-sm font-medium text-primary underline"
      >
        Back to employee directory
      </Link>
    </div>
  );
}
