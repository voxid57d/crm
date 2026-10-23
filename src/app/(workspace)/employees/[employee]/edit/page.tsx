import Link from "next/link";
import { getEmployee, allScopes } from "@/features/employees/queries";
import { saveEmployee } from "@/features/employees/actions";
import { ActionForm } from "@/components/forms/action-form";
import { EmployeeFields } from "@/components/forms/employee-fields";

export const metadata = { title: "Edit employee" };
export default async function EditEmployee({
  params,
}: {
  params: Promise<{ employee: string }>;
}) {
  const { employee: id } = await params;
  const { workspace, employee, branchIds } = await getEmployee(id);
  if (!allScopes(workspace, branchIds, "employees.update"))
    return (
      <p role="alert">
        You cannot update this employee across all assigned branches.
      </p>
    );
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Edit {employee.full_name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Update profile details, employment status and branch assignments
          together.
        </p>
      </div>
      <div className="rounded-xl border bg-white p-6">
        <ActionForm action={saveEmployee} submit="Save employee">
          <EmployeeFields
            tenantId={workspace.tenant.id}
            employee={employee}
            branches={workspace.branches}
            branchIds={branchIds}
            today={employee.start_date}
            canArchive={allScopes(workspace, branchIds, "employees.archive")}
          />
        </ActionForm>
      </div>
      <Link
        href={`/employees/${id}`}
        className="text-sm text-primary underline"
      >
        Back to employee profile
      </Link>
    </div>
  );
}
