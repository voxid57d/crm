import { getWorkspace } from "@/features/workspace/context";
import { saveEmployee } from "@/features/employees/actions";
import { ActionForm } from "@/components/forms/action-form";
import { EmployeeFields } from "@/components/forms/employee-fields";

export const metadata = { title: "Add employee" };
export default async function AddEmployee() {
  const workspace = await getWorkspace();
  if (!workspace.permissions.has("employees.create"))
    return <p role="alert">Employee creation is not permitted by your role.</p>;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: workspace.tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Add employee</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Create an employment record. A login account and salary settings are
          optional and managed separately.
        </p>
      </div>
      <div className="rounded-xl border bg-white p-6">
        <ActionForm action={saveEmployee} submit="Create employee">
          <EmployeeFields
            tenantId={workspace.tenant.id}
            branches={workspace.branches}
            today={today}
            canArchive={workspace.permissions.has("employees.archive")}
          />
        </ActionForm>
      </div>
    </div>
  );
}
