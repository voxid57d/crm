import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { uuid } from "@/lib/validation.mjs";

export const customerOptions = cache(async () => {
  const workspace = await getWorkspace();
  const [statuses, tags, fields, employees] = await Promise.all([
    workspace.supabase
      .from("customer_statuses")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("name"),
    workspace.supabase
      .from("customer_tags")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("name"),
    workspace.supabase
      .from("customer_field_definitions")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .order("name"),
    workspace.supabase.rpc("customer_employee_choices", {
      p_tenant: workspace.tenant.id,
    }),
  ]);
  if (statuses.error || tags.error || fields.error || employees.error)
    throw new Error(
      "Customer options could not load. Check local migrations and permissions.",
    );
  return {
    workspace,
    statuses: statuses.data,
    tags: tags.data,
    fields: fields.data,
    employees: employees.data,
  };
});
export const getCustomer = cache(async (id: string) => {
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const options = await customerOptions();
  const { workspace } = options;
  const row = await workspace.supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", workspace.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (row.error)
    throw new Error(
      "Customer could not load. Verify local services and access.",
    );
  if (!row.data) notFound();
  const [branches, tags, student, values] = await Promise.all([
    workspace.supabase
      .from("customer_branches")
      .select("branch_id")
      .eq("tenant_id", workspace.tenant.id)
      .eq("customer_id", id),
    workspace.supabase
      .from("customer_tag_links")
      .select("tag_id")
      .eq("tenant_id", workspace.tenant.id)
      .eq("customer_id", id),
    workspace.supabase
      .from("student_profiles")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .eq("customer_id", id)
      .maybeSingle(),
    workspace.supabase
      .from("customer_field_values")
      .select("*")
      .eq("tenant_id", workspace.tenant.id)
      .eq("customer_id", id),
  ]);
  if (branches.error || tags.error || student.error || values.error)
    throw new Error("Customer details could not load.");
  return {
    ...options,
    customer: row.data,
    branchIds: branches.data.map((b) => b.branch_id),
    tagIds: tags.data.map((t) => t.tag_id),
    student: student.data,
    values: values.data,
  };
});
