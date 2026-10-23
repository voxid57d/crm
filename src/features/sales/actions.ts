"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { getLead } from "./queries";
import { text, email, uuid, InputError } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
import { zonedTimeToIso } from "./time.mjs";

function fail(error: unknown): ActionState {
  unstable_rethrow(error);
  return {
    error:
      error instanceof InputError
        ? error.message
        : "The sales change could not be saved. Check permissions, inputs, and local services.",
  };
}
async function context(form: FormData) {
  const workspace = await getWorkspace();
  if (uuid(form.get("tenant_id")) !== workspace.tenant.id)
    throw new InputError("Business changed. Reload before saving.");
  return workspace;
}
async function target(form: FormData, permission: string) {
  const workspace = await context(form);
  const record = await getLead(uuid(form.get("lead_id")));
  assertPermission(workspace, "leads.view", record.lead.branch_id);
  assertPermission(workspace, permission, record.lead.branch_id);
  return record;
}
function refresh() {
  revalidatePath("/sales", "layout");
  revalidatePath("/leads", "layout");
  revalidatePath("/customers", "layout");
}
export async function saveLead(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let id: string;
  try {
    const workspace = await context(form);
    const oldId = form.get("lead_id") ? uuid(form.get("lead_id")) : null;
    const branch = uuid(form.get("branch_id"));
    assertPermission(workspace, "leads.view", branch);
    assertPermission(
      workspace,
      oldId ? "leads.update" : "leads.create",
      branch,
    );
    if (oldId) await target(form, "leads.update");
    const employee = text(form, "assigned_employee_id"),
      source = text(form, "source_id");
    const result = await workspace.supabase.rpc("save_lead", {
      p_tenant: workspace.tenant.id,
      p_id: oldId,
      p_data: {
        branch_id: branch,
        pipeline_id: uuid(form.get("pipeline_id")),
        stage_id: uuid(form.get("stage_id")),
        first_name: text(form, "first_name", {
          min: 1,
          max: 100,
          label: "First name",
        }),
        last_name: text(form, "last_name", { max: 100 }),
        phone: text(form, "phone", { min: 3, max: 40, label: "Phone" }),
        secondary_phone: text(form, "secondary_phone", { max: 40 }),
        email: email(form, "email", true),
        interested_service: text(form, "interested_service", { max: 300 }),
        source_id: source ? uuid(source) : "",
        assigned_employee_id: employee ? uuid(employee) : "",
        priority: text(form, "priority"),
      },
    });
    if (result.error)
      return {
        error:
          "Lead could not be saved. Check the active branch/stage, assignment permission, and employee sales access. Converted/archived leads cannot be edited.",
      };
    id = result.data;
  } catch (error) {
    return fail(error);
  }
  refresh();
  redirect(`/leads/${id}?saved=1`);
}
export async function changeStage(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, lead } = await target(form, "leads.change_stage");
    const reason = text(form, "reason_id");
    const result = await workspace.supabase.rpc("move_lead", {
      p_tenant: workspace.tenant.id,
      p_lead: lead.id,
      p_stage: uuid(form.get("stage_id")),
      p_expected_stage: uuid(form.get("expected_stage")),
      ...(reason ? { p_reason: uuid(reason) } : {}),
      p_notes: text(form, "loss_notes", { max: 2000 }),
    });
    if (result.error)
      return {
        error:
          result.error.code === "40001"
            ? "This lead changed. Reload the board before trying again."
            : "Stage change rejected. Use conversion for a Converted stage; lost/disqualified stages need an active reason. Check current permissions.",
      };
    refresh();
    return { success: "Lead stage saved." };
  } catch (error) {
    return fail(error);
  }
}
export async function archiveLead(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, lead } = await target(form, "leads.archive");
    const archive = text(form, "archive");
    if (!["true", "false"].includes(archive))
      throw new InputError("Choose archive or restore.");
    const result = await workspace.supabase.rpc("archive_lead", {
      p_tenant: workspace.tenant.id,
      p_lead: lead.id,
      p_archive: archive === "true",
    });
    if (result.error) return { error: "Archive/restore denied." };
    refresh();
    return {
      success:
        archive === "true"
          ? "Lead archived; history retained."
          : "Lead restored.",
    };
  } catch (error) {
    return fail(error);
  }
}
export async function addNote(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, lead } = await target(form, "leads.update");
    const result = await workspace.supabase.rpc("add_lead_note", {
      p_tenant: workspace.tenant.id,
      p_lead: lead.id,
      p_body: text(form, "body", { min: 1, max: 5000, label: "Note" }),
      p_kind: text(form, "note_kind"),
    });
    if (result.error)
      return {
        error:
          "Interaction could not be recorded. Archived leads must be restored first.",
      };
    refresh();
    return { success: "Interaction recorded." };
  } catch (error) {
    return fail(error);
  }
}
export async function saveFollowup(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, lead } = await target(form, "leads.manage_followups");
    const local = text(form, "scheduled_local", { max: 16 });
    let scheduled: string;
    try {
      scheduled = local
        ? zonedTimeToIso(local, workspace.tenant.timezone)
        : text(form, "scheduled_at", {
            min: 16,
            max: 40,
            label: "Scheduled time",
          });
    } catch (error) {
      throw new InputError(
        error instanceof Error ? error.message : "Invalid scheduled time.",
      );
    }
    if (
      !/(Z|[+-]\d{2}:\d{2})$/.test(scheduled) ||
      Number.isNaN(Date.parse(scheduled))
    )
      throw new InputError("Choose a time with an explicit UTC offset.");
    const result = await workspace.supabase.rpc("save_lead_followup", {
      p_tenant: workspace.tenant.id,
      p_lead: lead.id,
      p_id: form.get("followup_id") ? uuid(form.get("followup_id")) : null,
      p_data: {
        responsible_employee_id: uuid(form.get("responsible_employee_id")),
        kind: text(form, "kind"),
        description: text(form, "description", { min: 1, max: 2000 }),
        scheduled_at: scheduled,
      },
    });
    if (result.error)
      return {
        error:
          "Only pending follow-ups can be saved. Choose an active CRM-linked sales employee in this branch.",
      };
    refresh();
    return { success: "Follow-up saved." };
  } catch (error) {
    return fail(error);
  }
}
export async function completeFollowup(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace } = await target(form, "leads.manage_followups");
    const result = await workspace.supabase.rpc("complete_lead_followup", {
      p_tenant: workspace.tenant.id,
      p_followup: uuid(form.get("followup_id")),
      p_outcome: text(form, "outcome_notes", {
        min: 1,
        max: 3000,
        label: "Outcome",
      }),
    });
    if (result.error)
      return {
        error: "Follow-up completion denied. Verify the lead and branch scope.",
      };
    refresh();
    return { success: "Follow-up completed." };
  } catch (error) {
    return fail(error);
  }
}
export async function convertLead(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { workspace, lead } = await target(form, "leads.convert");
    if (form.get("confirm") !== "on")
      throw new InputError("Confirm conversion before continuing.");
    const customer = text(form, "customer_id");
    const result = await workspace.supabase.rpc("convert_lead", {
      p_tenant: workspace.tenant.id,
      p_lead: lead.id,
      ...(customer ? { p_customer: uuid(customer) } : {}),
      p_confirm_duplicate: form.get("separate_customer") === "on",
    });
    if (result.error)
      return {
        error:
          "Conversion rejected. Review customer matches, customer creation/view permission, branch compatibility, and the active conversion stage. Reopen lost leads first.",
      };
    refresh();
    return {
      success:
        "Lead converted and customer linked. No course enrollment was created.",
    };
  } catch (error) {
    return fail(error);
  }
}
export async function saveSalesSetting(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form),
      kind = text(form, "setting_kind");
    if (!["pipeline", "stage", "source", "loss_reason"].includes(kind))
      throw new InputError("Unknown setting.");
    assertPermission(
      workspace,
      ["source", "loss_reason"].includes(kind)
        ? "leads.manage_sources"
        : "leads.manage_pipelines",
    );
    const active = text(form, "is_active");
    if (!["true", "false"].includes(active))
      throw new InputError("Choose availability.");
    const result = await workspace.supabase.rpc("save_sales_setting", {
      p_tenant: workspace.tenant.id,
      p_id: form.get("setting_id") ? uuid(form.get("setting_id")) : null,
      p_kind: kind,
      p_data: {
        name: text(form, "name", { min: 1, max: 80 }),
        is_active: active === "true",
        ...(kind === "stage"
          ? {
              pipeline_id: uuid(form.get("pipeline_id")),
              position: Number(text(form, "position")) - 1,
              color: text(form, "color"),
              outcome: text(form, "outcome"),
            }
          : {}),
      },
    });
    if (result.error)
      return {
        error:
          "Setting rejected. Names must be unique, existing stage outcomes/pipelines are fixed, and each pipeline needs active open/conversion stages. The default pipeline must stay active.",
      };
    refresh();
    return { success: "Sales configuration saved with history." };
  } catch (error) {
    return fail(error);
  }
}
export async function reorderStages(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const workspace = await context(form);
    assertPermission(workspace, "leads.manage_pipelines");
    const result = await workspace.supabase.rpc("reorder_sales_stages", {
      p_tenant: workspace.tenant.id,
      p_pipeline: uuid(form.get("pipeline_id")),
      p_stages: text(form, "stage_order", { max: 10000 })
        .split(",")
        .map((s) => uuid(s.trim())),
    });
    if (result.error)
      return { error: "Provide every stage in this pipeline exactly once." };
    refresh();
    return { success: "Stage order saved." };
  } catch (error) {
    return fail(error);
  }
}
