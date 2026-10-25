"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getWorkspace, assertPermission } from "@/features/workspace/context";
import { InputError, text, uuid } from "@/lib/validation.mjs";
import type { ActionState } from "@/features/shared/action-state";
async function change(
  kind: "closure" | "exception",
  form: FormData,
): Promise<ActionState> {
  let destination: string;
  try {
    const w = await getWorkspace();
    if (uuid(form.get("tenant_id")) !== w.tenant.id)
      throw new InputError("Business changed. Reload before saving.");
    const raw = text(form, "id"),
      identifier = raw ? uuid(raw) : null,
      version = text(form, "version");
    if (!/^(0|[1-9][0-9]{0,8})$/.test(version))
      throw new InputError("Reload this calendar record before saving.");
    const common = {
      p_tenant: w.tenant.id,
      p_id: identifier,
      p_request: uuid(form.get("request_id")),
      p_version: Number(version),
    };
    let r;
    if (kind === "closure") {
      const rawBranch = text(form, "branch_id"),
        branch = rawBranch ? uuid(rawBranch) : null;
      if (branch) assertPermission(w, "schedules.manage_holidays", branch);
      else if (!w.businessPermissions.has("schedules.manage_holidays"))
        throw new InputError(
          "A business-wide holiday requires business-wide permission.",
        );
      r = await w.supabase.rpc("save_academic_closure", {
        ...common,
        p_data: {
          branch_id: branch,
          name: text(form, "name", { min: 1, max: 150 }),
          reason: text(form, "reason", { min: 3, max: 1000 }),
          from_date: text(form, "from_date"),
          to_date: text(form, "to_date"),
          is_active: form.get("is_active") === "true",
        },
      });
      destination = `/scheduling/closures/${r.data}`;
    } else {
      const group = uuid(form.get("group_id")),
        series = uuid(form.get("series_id")),
        source = await w.supabase
          .from("group_schedule_series")
          .select("group_id,branch_id")
          .eq("tenant_id", w.tenant.id)
          .eq("id", series)
          .single();
      if (source.error || source.data.group_id !== group)
        throw new InputError(
          "Choose a weekly series in this authorized group.",
        );
      assertPermission(w, "schedules.manage", source.data.branch_id);
      r = await w.supabase.rpc("save_schedule_exception", {
        ...common,
        p_data: {
          series_id: series,
          occurrence_date: text(form, "occurrence_date"),
          reason: text(form, "reason", { min: 3, max: 1000 }),
          is_active: form.get("is_active") === "true",
        },
      });
      destination = `/groups/${group}/schedules/exceptions?saved=1`;
    }
    if (r.error) {
      const known = [
        "Past closure",
        "Create a current",
        "Only current",
        "Use a closure",
        "Enter a closure",
        "Choose an active",
        "Occurrence exception",
      ];
      return {
        error:
          r.error.code === "40001"
            ? "This calendar record changed. Reload before saving."
            : r.error.code === "23P01"
              ? "Restoring the weekly reservation conflicts with another booking. Resolve that booking before reopening this date."
              : r.error.code === "23505"
                ? "An exception already exists for this series and date. Update the retained record."
                : known.some((k) => r.error!.message.startsWith(k))
                  ? r.error.message
                  : "Calendar change rejected. Check actual scope, dates, current version and resource conflicts. Existing lessons remain unchanged.",
      };
    }
  } catch (e) {
    unstable_rethrow(e);
    return {
      error:
        e instanceof InputError
          ? e.message
          : "Calendar change could not be saved. Check local services and access.",
    };
  }
  for (const p of [
    "/scheduling",
    "/groups",
    "/lessons",
    "/timetable",
    "/attendance",
    "/students",
    "/customers",
    "/academics",
  ])
    revalidatePath(p, "layout");
  redirect(destination);
}
export async function saveClosure(_s: ActionState, f: FormData) {
  return change("closure", f);
}
export async function saveOccurrenceException(_s: ActionState, f: FormData) {
  return change("exception", f);
}
