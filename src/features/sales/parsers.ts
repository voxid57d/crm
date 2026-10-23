import type { Json } from "@/lib/supabase/database.types";
import type { LeadFeed, FollowupCard, Analytics } from "./types";
export function record(v: Json | undefined): Record<string, Json | undefined> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid sales response.");
  return v;
}
function list(v: Json | undefined) {
  if (!Array.isArray(v)) throw new Error("Invalid sales list.");
  return v;
}
function str(v: Json | undefined) {
  if (typeof v !== "string") throw new Error("Invalid sales field.");
  return v;
}
function nullable(v: Json | undefined) {
  return v === null ? null : str(v);
}
function number(v: Json | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error("Invalid sales count.");
  return v;
}
export function leadFeed(v: Json): LeadFeed {
  const r = record(v);
  return {
    rows: list(r.rows).map((item) => {
      const c = record(item);
      return {
        id: str(c.id),
        first_name: str(c.first_name),
        last_name: str(c.last_name),
        phone: str(c.phone),
        priority: str(c.priority),
        branch_id: str(c.branch_id),
        pipeline_id: str(c.pipeline_id),
        stage_id: str(c.stage_id),
        status: str(c.status),
        assigned_employee_id: nullable(c.assigned_employee_id),
        employee_name: nullable(c.employee_name),
        next_follow_up: nullable(c.next_follow_up),
        created_at: str(c.created_at),
        archived: c.archived === true,
      };
    }),
    total: number(r.total),
    stage_counts: Object.fromEntries(
      Object.entries(record(r.stage_counts)).map(([k, v]) => [k, number(v)]),
    ),
  };
}
export function followupFeed(v: Json): { rows: FollowupCard[]; total: number } {
  const r = record(v);
  return {
    total: number(r.total),
    rows: list(r.rows).map((item) => {
      const f = record(item);
      return {
        id: str(f.id),
        lead_id: str(f.lead_id),
        lead_name: str(f.lead_name),
        branch_id: str(f.branch_id),
        responsible_employee_id: str(f.responsible_employee_id),
        employee_name: str(f.employee_name),
        kind: str(f.kind),
        description: str(f.description),
        scheduled_at: str(f.scheduled_at),
        completed_at: nullable(f.completed_at),
        outcome_notes: nullable(f.outcome_notes),
      };
    }),
  };
}
export function analytics(v: Json): Analytics {
  const r = record(v);
  const breakdown = (key: string) =>
    list(r[key]).map((item) => {
      const b = record(item);
      return { label: str(b.label), count: number(b.count) };
    });
  return {
    total: number(r.total),
    converted: number(r.converted),
    lost: number(r.lost),
    disqualified: number(r.disqualified),
    new_leads: number(r.new_leads),
    conversion_rate: number(r.conversion_rate),
    overdue_followups: number(r.overdue_followups),
    sources: breakdown("sources"),
    stages: breakdown("stages"),
    employees: breakdown("employees"),
    branches: breakdown("branches"),
    trend: breakdown("trend"),
  };
}
