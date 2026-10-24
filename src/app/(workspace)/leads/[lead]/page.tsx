import Link from "next/link";
import { getLead, pageNumber, type Search } from "@/features/sales/queries";
import {
  changeStage,
  archiveLead,
  addNote,
  saveFollowup,
  completeFollowup,
  convertLead,
} from "@/features/sales/actions";
import { SalesIdentity, FollowupFields } from "@/components/sales/fields";
import { SalesNavigation } from "@/components/sales/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { TextArea } from "@/components/customers/fields";
import { ActivityItem } from "@/components/customers/activity";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isEducationBusiness } from "@/features/workspace/business.mjs";

export const metadata = { title: "Lead profile" };
export default async function LeadProfile({
  params,
  searchParams,
}: {
  params: Promise<{ lead: string }>;
  searchParams: Promise<Search>;
}) {
  const { lead: id } = await params,
    filters = await searchParams;
  const options = await getLead(id);
  const {
    workspace,
    lead,
    stages,
    sources,
    pipelines,
    reasons,
    employeeChoices,
  } = options;
  const education = isEducationBusiness(workspace.tenant.business_type);
  const permission = (key: string) =>
    workspace.branchPermissions.get(lead.branch_id)?.has(key) ?? false;
  const activityPage = pageNumber(filters.activity_page),
    notesPage = pageNumber(filters.notes_page),
    followupPage = pageNumber(filters.followup_page);
  const customerSearch =
    typeof filters.customer_q === "string"
      ? filters.customer_q.slice(0, 100)
      : "";
  const [
    activities,
    notes,
    followups,
    matches,
    existing,
    duplicateLeads,
    linkedCustomer,
  ] = await Promise.all([
    workspace.supabase
      .from("lead_activities")
      .select("*", { count: "exact" })
      .eq("tenant_id", workspace.tenant.id)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(activityPage * 20, activityPage * 20 + 19),
    workspace.supabase
      .from("lead_notes")
      .select("*", { count: "exact" })
      .eq("tenant_id", workspace.tenant.id)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(notesPage * 20, notesPage * 20 + 19),
    workspace.supabase
      .from("lead_followups")
      .select("*", { count: "exact" })
      .eq("tenant_id", workspace.tenant.id)
      .eq("lead_id", id)
      .order("scheduled_at")
      .order("id")
      .range(followupPage * 20, followupPage * 20 + 19),
    permission("leads.convert")
      ? workspace.supabase.rpc("customer_duplicate_candidates", {
          p_tenant: workspace.tenant.id,
          p_phone: lead.phone,
          p_email: lead.email ?? "",
          p_name: lead.first_name + " " + lead.last_name,
        })
      : Promise.resolve({ data: [], error: null }),
    customerSearch && permission("leads.convert")
      ? workspace.supabase.rpc("customer_directory", {
          p_tenant: workspace.tenant.id,
          p_branch: lead.branch_id,
          p_search: customerSearch,
        })
      : Promise.resolve({ data: [], error: null }),
    workspace.supabase.rpc("lead_duplicate_candidates", {
      p_tenant: workspace.tenant.id,
      p_phone: lead.phone,
      p_email: lead.email ?? "",
      p_exclude: id,
    }),
    lead.customer_id
      ? workspace.supabase
          .from("customers")
          .select("id,first_name,last_name")
          .eq("tenant_id", workspace.tenant.id)
          .eq("id", lead.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (
    activities.error ||
    notes.error ||
    followups.error ||
    matches.error ||
    existing.error ||
    duplicateLeads.error ||
    linkedCustomer.error
  )
    throw new Error(
      "Lead history or conversion options could not load. Verify local services.",
    );
  const linkedStudent = lead.customer_id
    ? await workspace.supabase
        .from("student_profiles")
        .select("customer_id")
        .eq("tenant_id", workspace.tenant.id)
        .eq("customer_id", lead.customer_id)
        .maybeSingle()
    : { data: null, error: null };
  if (linkedStudent.error) throw new Error("Linked student could not load.");
  const employees = Array.from(
    new Map(
      Object.values(employeeChoices)
        .flat()
        .map((e) => [e.id, e]),
    ).values(),
  );
  const labels = Object.fromEntries([
    ...stages.map((s) => [s.id, s.name]),
    ...sources.map((s) => [s.id, s.name]),
    ...reasons.map((r) => [r.id, r.name]),
    ...pipelines.map((p) => [p.id, p.name]),
    ...workspace.branches.map((b) => [b.id, b.name]),
    ...employees.map((e) => [e.id, e.full_name]),
  ]);
  const customerChoices = Array.from(
    new Map(
      [
        ...matches.data.map((c) => ({ id: c.id, name: c.full_name })),
        ...existing.data.map((c) => ({
          id: c.id,
          name: c.first_name + " " + c.last_name,
        })),
      ].map((c) => [c.id, c]),
    ).values(),
  );
  const now = new Date().toISOString(),
    date = (v: string) =>
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: workspace.tenant.timezone,
      }).format(new Date(v));
  const pager = (key: string, page: number) => {
    const q = new URLSearchParams({
      activity_page: String(activityPage),
      notes_page: String(notesPage),
      followup_page: String(followupPage),
    });
    q.set(key, String(page));
    return `/leads/${id}?${q}`;
  };
  const pageControls = (key: string, page: number, count: number) => (
    <div className="flex gap-4 text-sm text-primary">
      {page > 0 && (
        <Link href={pager(key, page - 1)} className="underline">
          Previous
        </Link>
      )}
      {(page + 1) * 20 < count && (
        <Link href={pager(key, page + 1)} className="underline">
          Next
        </Link>
      )}
    </div>
  );
  return (
    <div className="space-y-6">
      <SalesNavigation />
      {filters.saved && (
        <p
          role="status"
          className="rounded-xl border bg-secondary p-4 text-sm text-primary"
        >
          Lead saved.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Sales lead
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {lead.first_name} {lead.last_name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary">{labels[lead.stage_id]}</Badge>
            <Badge variant="outline">{lead.status}</Badge>
            {lead.archived_at && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
        {!lead.archived_at &&
          lead.status !== "converted" &&
          permission("leads.update") && (
            <Button asChild variant="outline">
              <Link href={`/leads/${id}/edit`}>Edit lead</Link>
            </Button>
          )}
      </div>
      <nav
        aria-label="Lead profile sections"
        className="flex flex-wrap gap-4 text-sm text-primary"
      >
        {["overview", "activity", "notes", "followups", "conversion"].map(
          (section) => (
            <a
              key={section}
              href={`#${section}`}
              className="capitalize underline"
            >
              {section}
            </a>
          ),
        )}
      </nav>
      <section id="overview" className="rounded-xl border bg-white p-5">
        <h2 className="mb-5 text-lg font-semibold">Overview</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Phone", lead.phone],
            ["Secondary phone", lead.secondary_phone],
            ["Email", lead.email],
            ["Interested service", lead.interested_service],
            ["Branch", labels[lead.branch_id]],
            ["Pipeline", labels[lead.pipeline_id]],
            [
              "Assigned employee",
              lead.assigned_employee_id
                ? (labels[lead.assigned_employee_id] ??
                  "Previous employee (unavailable)")
                : "Unassigned",
            ],
            ["Source", lead.source_id ? labels[lead.source_id] : "Unspecified"],
            ["Priority", lead.priority],
            ["Created", date(lead.created_at)],
            ["Last updated", date(lead.updated_at)],
            [
              "Loss reason",
              lead.loss_reason_id ? labels[lead.loss_reason_id] : "",
            ],
            ["Lost at", lead.lost_at ? date(lead.lost_at) : ""],
            ["Loss notes", lead.loss_notes],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">
                {value || "Not provided"}
              </dd>
            </div>
          ))}
        </dl>
        {duplicateLeads.data.length > 0 && (
          <div className="mt-6 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Possible duplicate leads</h3>
            <p className="my-2 text-xs text-muted-foreground">
              Matching normalized phone or email within your access. Nothing is
              merged automatically.
            </p>
            {duplicateLeads.data.map((l) => (
              <p key={l.id} className="text-sm">
                <Link
                  href={`/leads/${l.id}`}
                  className="text-primary underline"
                >
                  {l.full_name}
                </Link>{" "}
                · {l.phone} · {l.status}
              </p>
            ))}
          </div>
        )}
      </section>
      {!lead.archived_at &&
        lead.status !== "converted" &&
        permission("leads.change_stage") && (
          <section className="rounded-xl border bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">
              Change stage / reopen lead
            </h2>
            <ActionForm
              action={changeStage}
              submit="Save stage"
              confirmation="Apply this stage change? Lost/disqualified outcomes and reopening will be recorded in history."
            >
              <SalesIdentity tenantId={workspace.tenant.id} leadId={id} />
              <input
                type="hidden"
                name="expected_stage"
                value={lead.stage_id}
              />
              <SelectField
                label="Target stage"
                name="stage_id"
                defaultValue={lead.stage_id}
              >
                {stages
                  .filter((s) => s.is_active && s.outcome !== "won")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {labels[s.pipeline_id]} / {s.name}
                    </option>
                  ))}
              </SelectField>
              <SelectField
                label="Loss reason (required for Lost / Disqualified)"
                name="reason_id"
                defaultValue=""
              >
                <option value="">Not applicable</option>
                {reasons
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </SelectField>
              <TextArea
                label="Outcome notes (optional)"
                name="loss_notes"
                maxLength={2000}
              />
            </ActionForm>
          </section>
        )}
      <section id="notes" className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Notes & communications</h2>
        {!lead.archived_at && permission("leads.update") && (
          <ActionForm action={addNote} submit="Record communication">
            <SalesIdentity tenantId={workspace.tenant.id} leadId={id} />
            <SelectField
              label="Communication type"
              name="note_kind"
              defaultValue="note"
            >
              {["note", "call", "meeting", "message", "email"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </SelectField>
            <TextArea label="Internal note" name="body" required />
          </ActionForm>
        )}
        {notes.data.map((n) => (
          <article key={n.id} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">
              {n.kind} · {n.author_name} · {date(n.created_at)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm">{n.body}</p>
          </article>
        ))}
        {!notes.data.length && (
          <p className="text-sm text-muted-foreground">
            No communications on this page.
          </p>
        )}
        {pageControls("notes_page", notesPage, notes.count ?? 0)}
      </section>
      <section
        id="followups"
        className="space-y-4 rounded-xl border bg-white p-5"
      >
        <h2 className="text-lg font-semibold">Follow-ups</h2>
        {!lead.archived_at && permission("leads.manage_followups") && (
          <details>
            <summary className="cursor-pointer text-sm text-primary">
              Schedule follow-up
            </summary>
            <div className="mt-4">
              <ActionForm action={saveFollowup} submit="Schedule follow-up">
                <FollowupFields
                  tenantId={workspace.tenant.id}
                  leadId={id}
                  employees={employeeChoices[lead.branch_id] ?? []}
                  timezone={workspace.tenant.timezone}
                />
              </ActionForm>
            </div>
          </details>
        )}
        {followups.data.map((f) => (
          <article key={f.id} className="space-y-3 rounded-lg border p-4">
            <p
              className={
                f.completed_at
                  ? "text-xs text-muted-foreground"
                  : f.scheduled_at < now
                    ? "text-xs text-destructive"
                    : "text-xs text-primary"
              }
            >
              {f.completed_at
                ? "Completed"
                : f.scheduled_at < now
                  ? "Overdue"
                  : "Upcoming"}{" "}
              · {date(f.scheduled_at)} ·{" "}
              {labels[f.responsible_employee_id] ?? "Previous employee"}
            </p>
            <p className="text-sm font-medium">{f.kind.replaceAll("_", " ")}</p>
            <p className="whitespace-pre-wrap text-sm">{f.description}</p>
            {f.completed_at ? (
              <p className="text-sm text-muted-foreground">
                Completed {date(f.completed_at)} · {f.outcome_notes}
              </p>
            ) : (
              !lead.archived_at &&
              permission("leads.manage_followups") && (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">
                      Edit pending activity
                    </summary>
                    <div className="mt-4">
                      <ActionForm action={saveFollowup} submit="Save follow-up">
                        <FollowupFields
                          tenantId={workspace.tenant.id}
                          leadId={id}
                          employees={employeeChoices[lead.branch_id] ?? []}
                          timezone={workspace.tenant.timezone}
                          followup={f}
                        />
                      </ActionForm>
                    </div>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">
                      Record completion
                    </summary>
                    <div className="mt-4">
                      <ActionForm
                        action={completeFollowup}
                        submit="Complete follow-up"
                      >
                        <SalesIdentity
                          tenantId={workspace.tenant.id}
                          leadId={id}
                        />
                        <input type="hidden" name="followup_id" value={f.id} />
                        <TextArea
                          label="Outcome notes"
                          name="outcome_notes"
                          required
                          maxLength={3000}
                        />
                      </ActionForm>
                    </div>
                  </details>
                </>
              )
            )}
          </article>
        ))}
        {!followups.data.length && (
          <p className="text-sm text-muted-foreground">
            No follow-ups on this page.
          </p>
        )}
        {pageControls("followup_page", followupPage, followups.count ?? 0)}
      </section>
      <section
        id="conversion"
        className="space-y-4 rounded-xl border bg-white p-5"
      >
        <h2 className="text-lg font-semibold">
          {education ? "Student conversion" : "Customer conversion"}
        </h2>
        {lead.customer_id ? (
          <>
            <p className="text-sm">
              Converted {lead.converted_at ? date(lead.converted_at) : ""}.
              Original source, employee, pipeline, and sales history are
              retained.
            </p>
            {linkedCustomer.data &&
              permission("invoices.view") &&
              permission("invoices.create") && (
                <Link
                  className="block text-sm font-medium text-primary underline"
                  href={`/finance/invoices/new?${new URLSearchParams({ customer: lead.customer_id, branch: lead.branch_id })}`}
                >
                  Create invoice for converted customer
                </Link>
              )}
            {linkedCustomer.data ? (
              <Link
                href={
                  education && linkedStudent.data
                    ? `/students/${lead.customer_id}`
                    : `/customers/${lead.customer_id}`
                }
                className="text-sm font-medium text-primary underline"
              >
                {education && linkedStudent.data
                  ? "Open student:"
                  : "Open contact:"}{" "}
                {linkedCustomer.data.first_name} {linkedCustomer.data.last_name}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                The linked customer is outside your customer-view scope.
              </p>
            )}
            {education &&
              linkedCustomer.data &&
              !linkedStudent.data &&
              !lead.archived_at &&
              permission("leads.convert") && (
                <ActionForm
                  action={convertLead}
                  submit="Add student profile"
                  confirmation="Add a student profile to this existing converted contact? Its identity, sales and financial history remain linked."
                >
                  <SalesIdentity tenantId={workspace.tenant.id} leadId={id} />
                  <input
                    type="hidden"
                    name="customer_id"
                    value={lead.customer_id}
                  />
                  <input type="hidden" name="confirm" value="on" />
                  <p className="text-sm text-muted-foreground">
                    This historical conversion has a contact without a student
                    profile. Add one explicitly; no invoice or course enrollment
                    is created.
                  </p>
                </ActionForm>
              )}
          </>
        ) : !lead.archived_at &&
          lead.status === "open" &&
          permission("leads.convert") ? (
          <>
            <p className="text-sm text-muted-foreground">
              Review existing student/contact matches first. Linking preserves
              shared identity details and requires the lead branch to be
              assigned.{" "}
              {education
                ? "Conversion creates or reuses a student profile and opens it. No invoice or course enrollment is created."
                : "Generic conversion creates or links a contact without creating a student or course enrollment."}
            </p>
            {matches.data.length > 0 && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-2 font-medium">
                  Possible existing student / contact matches
                </p>
                {matches.data.map((c) => (
                  <p key={c.id}>
                    <Link
                      className="text-primary underline"
                      href={`/customers/${c.id}`}
                    >
                      {c.full_name}
                    </Link>{" "}
                    · {c.phone} · {c.archived ? "Archived" : c.match_reason}
                  </p>
                ))}
              </div>
            )}
            <form className="flex flex-wrap items-end gap-3">
              <Field
                label="Find an existing student / contact by name, phone or email"
                name="customer_q"
                defaultValue={customerSearch}
                maxLength={100}
              />
              <Button variant="outline">Search contacts</Button>
            </form>
            <ActionForm
              action={convertLead}
              submit="Convert lead"
              confirmation="Confirm conversion? This permanently links the sales outcome to the selected customer or creates a new contact. The original lead and history remain."
            >
              <SalesIdentity tenantId={workspace.tenant.id} leadId={id} />
              <SelectField
                label={education ? "Student or existing contact" : "Customer"}
                name="customer_id"
                defaultValue=""
              >
                <option value="">
                  {education
                    ? "Create a new student from this lead"
                    : "Create a new customer from this lead"}
                </option>
                {customerChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              {matches.data.length > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="separate_customer"
                    className="mt-1 size-4 accent-primary"
                  />
                  If creating a new customer, I reviewed the matches and confirm
                  this is a separate contact.
                </label>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirm"
                  required
                  className="mt-1 size-4 accent-primary"
                />
                I confirm the customer selection and conversion.
              </label>
            </ActionForm>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            An open, non-archived lead and conversion permission are required.
            Reopen lost/disqualified leads before conversion.
          </p>
        )}
      </section>
      <section id="activity" className="space-y-4">
        <h2 className="text-lg font-semibold">Activity history</h2>
        <p className="text-xs text-muted-foreground">
          Verified actors and times in {workspace.tenant.timezone}. History
          cannot be edited or erased.
        </p>
        {activities.data.map((a) => (
          <ActivityItem
            key={a.id}
            activity={a}
            at={date(a.created_at)}
            labels={labels}
            entity="Lead"
          />
        ))}
        {pageControls("activity_page", activityPage, activities.count ?? 0)}
      </section>
      {permission("leads.archive") && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 font-semibold">
            {lead.archived_at ? "Restore lead" : "Archive lead"}
          </h2>
          <ActionForm
            action={archiveLead}
            submit={lead.archived_at ? "Restore lead" : "Archive lead"}
            confirmation="Confirm archive/restore? No lead, customer, note, or activity history will be deleted."
          >
            <SalesIdentity tenantId={workspace.tenant.id} leadId={id} />
            <input
              type="hidden"
              name="archive"
              value={lead.archived_at ? "false" : "true"}
            />
            <p className="text-sm text-muted-foreground">
              Archived records retain their full history and remain available
              through the lead table’s Archived filter.
            </p>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
