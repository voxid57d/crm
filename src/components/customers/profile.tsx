import Link from "next/link";
import { getCustomer, getStudent } from "@/features/customers/queries";
import { allScopes } from "@/features/workspace/context";
import { archiveCustomer, saveNote } from "@/features/customers/actions";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField } from "@/components/forms/field";
import { CustomerIdentity, TextArea } from "@/components/customers/fields";
import { Guardians } from "@/components/customers/guardians";
import { ActivityItem } from "@/components/customers/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  canCustomerFinance,
  canCustomerDebt,
} from "@/features/finance/invoice-queries";
import { CustomerFinanceCard } from "@/components/finance/customer-finance-card";
import { ContactFinances } from "@/components/finance/contact-finances";
import { StudentEnrollments } from "@/components/academics/student-enrollments";
import { StudentLearning } from "@/components/academics/student-learning";
import { enrollmentStatus } from "@/features/academics/integration-queries";

function NoteKind({ value = "note" }: { value?: string }) {
  return (
    <SelectField label="Interaction type" name="note_kind" defaultValue={value}>
      {["note", "call", "email", "meeting", "message"].map((kind) => (
        <option key={kind} value={kind}>
          {kind}
        </option>
      ))}
    </SelectField>
  );
}
export type ProfileSearch = {
  saved?: string;
  activity_page?: string;
  notes_page?: string;
  guardian_search?: string;
  branch?: string;
  finance_page?: string;
  payment_page?: string;
  refund_page?: string;
  enrollment_page?: string;
  enrollment_status?: string;
  lesson_from?: string;
  lesson_to?: string;
  lesson_status?: string;
  lesson_page?: string;
  academic_page?: string;
  academic_invoice_page?: string;
};
export async function ContactProfile({
  id,
  filters,
  studentFirst = false,
}: {
  id: string;
  filters: ProfileSearch;
  studentFirst?: boolean;
}) {
  const record = studentFirst ? await getStudent(id) : await getCustomer(id);
  const base = studentFirst ? "/students" : "/customers";
  const {
    workspace,
    customer,
    student,
    branchIds,
    tagIds,
    values,
    statuses,
    tags,
    fields,
    employees,
  } = record;
  const page = (v?: string) =>
    Math.min(100000, Math.max(0, parseInt(v ?? "0", 10) || 0));
  const activityPage = page(filters.activity_page),
    notesPage = page(filters.notes_page);
  const notesAllowed = allScopes(workspace, branchIds, "customers.view_notes"),
    canEdit =
      !customer.archived_at &&
      allScopes(workspace, branchIds, "customers.update");
  const canNotes =
    !customer.archived_at &&
    notesAllowed &&
    allScopes(workspace, branchIds, "customers.manage_notes");
  const guardianSearch = (
    typeof filters.guardian_search === "string" ? filters.guardian_search : ""
  )
    .slice(0, 100)
    .replace(/[%_\\]/g, "");
  const [activities, notes, links, guardianChoices] = await Promise.all([
    workspace.supabase
      .from("customer_activities")
      .select("*", { count: "exact" })
      .eq("tenant_id", workspace.tenant.id)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(activityPage * 20, activityPage * 20 + 19),
    notesAllowed
      ? workspace.supabase
          .from("customer_notes")
          .select("*", { count: "exact" })
          .eq("tenant_id", workspace.tenant.id)
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(notesPage * 20, notesPage * 20 + 19)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    student
      ? workspace.supabase
          .from("student_guardians")
          .select("*")
          .eq("tenant_id", workspace.tenant.id)
          .eq("customer_id", id)
      : Promise.resolve({ data: [], error: null }),
    student && canEdit
      ? workspace.supabase
          .from("guardians")
          .select("*")
          .eq("tenant_id", workspace.tenant.id)
          .ilike("full_name", `%${guardianSearch}%`)
          .order("full_name")
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (activities.error || notes.error || links.error || guardianChoices.error)
    throw new Error(
      "Customer history could not load. Check local services and permissions.",
    );
  const contacts = links.data.length
    ? await workspace.supabase
        .from("guardians")
        .select("*")
        .eq("tenant_id", workspace.tenant.id)
        .in(
          "id",
          links.data.map((l) => l.guardian_id),
        )
    : { data: [], error: null };
  if (contacts.error) throw new Error("Guardian details could not load.");
  const convertedLeads = await workspace.supabase
    .from("leads")
    .select("id,first_name,last_name,converted_at")
    .eq("tenant_id", workspace.tenant.id)
    .eq("customer_id", id)
    .order("converted_at", { ascending: false })
    .limit(20);
  if (convertedLeads.error)
    throw new Error("Linked lead history could not load.");
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: workspace.tenant.timezone,
    }).format(new Date(value));
  const labels = Object.fromEntries([
    ...workspace.branches.map((b) => [b.id, b.name]),
    ...statuses.map((s) => [s.id, s.name]),
    ...tags.map((t) => [t.id, t.name]),
    ...fields.map((f) => [f.id, f.name]),
    ...employees.map((e) => [e.id, e.full_name]),
  ]);
  const profileFields = [
    ["Phone", customer.phone],
    ["Additional phone", customer.additional_phone],
    ["Email", customer.email],
    ["Date of birth", customer.date_of_birth],
    ["Gender", customer.gender],
    ["Address", customer.address],
    ["Status", statuses.find((s) => s.id === customer.status_id)?.name],
    ["Branches", branchIds.map((b) => labels[b]).join(", ") || "Unassigned"],
    [
      "Responsible employee",
      employees.find((e) => e.id === customer.responsible_employee_id)
        ?.full_name ??
        (customer.responsible_employee_id
          ? "Unavailable employee"
          : "Unassigned"),
    ],
    ["Tags", tagIds.map((t) => labels[t]).join(", ")],
    ["Created", date(customer.created_at)],
    ["Last modified", date(customer.updated_at)],
  ];
  const pager = (kind: "activity_page" | "notes_page", next: number) => {
    const q = new URLSearchParams({
      activity_page: String(activityPage),
      notes_page: String(notesPage),
    });
    q.set(kind, String(next));
    return `${base}/${id}?${q}#${kind === "activity_page" ? "activity" : "notes"}`;
  };
  return (
    <div className="space-y-6">
      {filters.saved && (
        <p
          role="status"
          className="rounded-xl border bg-secondary p-4 text-sm text-primary"
        >
          {studentFirst
            ? "Student details and branch assignments saved."
            : "Customer profile, branch assignments, and education details saved."}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {studentFirst
              ? "Student"
              : student
                ? "Contact with student profile"
                : "Contact"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {customer.first_name} {customer.last_name}
          </h1>
          <div className="mt-3 flex gap-2">
            <Badge variant="secondary">
              {statuses.find((s) => s.id === customer.status_id)?.name}
            </Badge>
            {customer.archived_at && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
        {canEdit && (
          <Button asChild variant="outline">
            <Link href={`${base}/${id}/edit`}>
              {studentFirst ? "Edit student" : "Edit customer & branches"}
            </Link>
          </Button>
        )}
      </div>
      {!student && canEdit && (
        <Button asChild>
          <Link href={"/students/new?existing=" + id}>
            Add student profile to this contact
          </Link>
        </Button>
      )}
      {student && !studentFirst && (
        <Link className="text-primary underline" href={"/students/" + id}>
          Open student profile
        </Link>
      )}
      <nav
        aria-label={
          studentFirst ? "Student profile sections" : "Contact profile sections"
        }
        className="flex flex-wrap gap-4 text-sm text-primary"
      >
        {[
          "overview",
          "notes",
          "activity",
          ...(student ? ["education", "guardians"] : []),
          "finance",
          "learning",
          ...(student
            ? [
                "lessons",
                "enrollment-charges",
                "academic-activity",
                "attendance",
              ]
            : []),
        ].map((section) => (
          <a
            key={section}
            href={`#${section}`}
            className="capitalize underline"
          >
            {section === "learning"
              ? "Courses & groups"
              : section.replaceAll("-", " ")}
          </a>
        ))}
      </nav>
      <section id="overview" className="rounded-xl border bg-white p-5 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Overview</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {profileFields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">
                {value || "Not provided"}
              </dd>
            </div>
          ))}
          {values.map((v) => (
            <div key={v.field_id}>
              <dt className="text-xs text-muted-foreground">
                {fields.find((f) => f.id === v.field_id)?.name ??
                  "Custom field"}
              </dt>
              <dd className="mt-1 break-words">
                {v.value === "true"
                  ? "Yes"
                  : v.value === "false"
                    ? "No"
                    : v.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {student && (
        <>
          <section
            id="education"
            className="rounded-xl border bg-white p-5 sm:p-6"
          >
            <h2 className="mb-5 text-lg font-semibold">Student profile</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                ["Identifier", student.student_identifier],
                [
                  "Education status",
                  student.education_status.replaceAll("_", " "),
                ],
                ["School / university", student.school],
                ["Education level", student.education_level],
                ["Enrollment date", student.enrollment_date],
                ["Learning goals", student.learning_goals],
                ["Additional information", student.additional_information],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">
                    {value || "Not provided"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Courses, enrollment history and lessons use this same Student
              Profile.
            </p>
          </section>
          <Guardians
            tenantId={workspace.tenant.id}
            customerId={id}
            links={links.data}
            contacts={contacts.data ?? []}
            choices={guardianChoices.data.filter(
              (g) => !links.data.some((l) => l.guardian_id === g.id),
            )}
            canEdit={canEdit}
            search={guardianSearch}
          />
        </>
      )}
      <section
        id="notes"
        className="space-y-5 rounded-xl border bg-white p-5 sm:p-6"
      >
        <h2 className="text-lg font-semibold">Notes & interactions</h2>
        {!notesAllowed ? (
          <p className="text-sm text-muted-foreground">
            Internal notes and their edit history are restricted.
          </p>
        ) : (
          <>
            {canNotes && (
              <ActionForm action={saveNote} submit="Record note / interaction">
                <CustomerIdentity
                  tenantId={workspace.tenant.id}
                  customerId={id}
                />
                <NoteKind />
                <TextArea label="Internal note" name="body" required />
              </ActionForm>
            )}
            <div className="space-y-4">
              {notes.data.map((note) => (
                <article key={note.id} className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    {note.kind} · {note.author_name} · {date(note.created_at)}
                    {note.updated_at !== note.created_at ? " · Edited" : ""}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                    {note.body}
                  </p>
                  {canNotes && note.author_id === workspace.user.id && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-primary">
                        Edit my note
                      </summary>
                      <div className="mt-4">
                        <ActionForm
                          action={saveNote}
                          submit="Save note correction"
                        >
                          <CustomerIdentity
                            tenantId={workspace.tenant.id}
                            customerId={id}
                          />
                          <input type="hidden" name="note_id" value={note.id} />
                          <NoteKind value={note.kind} />
                          <TextArea
                            label="Corrected note"
                            name="body"
                            value={note.body}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Previous text remains in the protected activity
                            history.
                          </p>
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </article>
              ))}
              {!notes.data.length && (
                <p className="text-sm text-muted-foreground">
                  No notes on this page.
                </p>
              )}
            </div>
            <div className="flex gap-4 text-sm text-primary">
              {notesPage > 0 && (
                <Link href={pager("notes_page", notesPage - 1)}>
                  Previous notes
                </Link>
              )}
              {(notesPage + 1) * 20 < (notes.count ?? 0) && (
                <Link href={pager("notes_page", notesPage + 1)}>
                  Older notes
                </Link>
              )}
            </div>
          </>
        )}
      </section>
      <section id="activity" className="space-y-4">
        <h2 className="text-lg font-semibold">Activity history</h2>
        {convertedLeads.data.length > 0 && (
          <div className="space-y-2 rounded-xl border bg-white p-4">
            <h3 className="text-sm font-medium">Linked lead conversions</h3>
            {convertedLeads.data.map((l) => (
              <p key={l.id} className="text-sm">
                <Link
                  className="text-primary underline"
                  href={`/leads/${l.id}`}
                >
                  {l.first_name} {l.last_name}
                </Link>
                {l.converted_at ? ` · ${date(l.converted_at)}` : ""}
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Times shown in {workspace.tenant.timezone}. History cannot be changed
          or erased by tenant users.
        </p>
        {activities.data.map((a) => (
          <ActivityItem
            entity={studentFirst ? "Student" : "Customer"}
            createdLabel={
              studentFirst &&
              student &&
              customer.created_at !== student.created_at
                ? "Contact created"
                : undefined
            }
            key={a.id}
            activity={a}
            at={date(a.created_at)}
            labels={labels}
          />
        ))}
        {!activities.data.length && (
          <p className="text-sm text-muted-foreground">
            No activity on this page.
          </p>
        )}
        <div className="flex gap-4 text-sm text-primary">
          {activityPage > 0 && (
            <Link href={pager("activity_page", activityPage - 1)}>
              Newer activity
            </Link>
          )}
          {(activityPage + 1) * 20 < (activities.count ?? 0) && (
            <Link href={pager("activity_page", activityPage + 1)}>
              Older activity
            </Link>
          )}
        </div>
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        {canCustomerFinance(workspace) ? (
          studentFirst || !canCustomerDebt(workspace) ? (
            <section id="finance" className="md:col-span-2">
              <ContactFinances
                customerId={id}
                search={filters}
                studentFirst={studentFirst}
                embedded
              />
            </section>
          ) : (
            <CustomerFinanceCard customerId={id} />
          )
        ) : (
          <section id="finance" className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">Financial information</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Financial information is restricted. Ask the business owner to
              review your financial permissions.
            </p>
          </section>
        )}
        {student ? (
          <>
            <StudentEnrollments
              studentId={id}
              path={`${base}/${id}`}
              page={page(filters.enrollment_page)}
              status={enrollmentStatus(filters)}
            />
            <StudentLearning
              student={id}
              path={`${base}/${id}`}
              search={filters}
            />
          </>
        ) : (
          <section id="learning" className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">
              Courses, groups, lessons & attendance
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Add a Student Profile through the existing Add Student workflow to
              use groups, enrollments and lessons. Attendance is planned for
              Step 8.
            </p>
          </section>
        )}
      </div>
      {allScopes(workspace, branchIds, "customers.archive") && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-semibold">
            {customer.archived_at
              ? studentFirst
                ? "Restore student"
                : "Restore customer"
              : studentFirst
                ? "Archive student"
                : "Archive customer"}
          </h2>
          <ActionForm
            action={archiveCustomer}
            submit={
              customer.archived_at
                ? studentFirst
                  ? "Restore student"
                  : "Restore customer"
                : studentFirst
                  ? "Archive student"
                  : "Archive customer"
            }
          >
            <CustomerIdentity tenantId={workspace.tenant.id} customerId={id} />
            {studentFirst && (
              <input type="hidden" name="student_first" value="on" />
            )}
            <input
              type="hidden"
              name="archive"
              value={customer.archived_at ? "false" : "true"}
            />
            <p className="text-sm text-muted-foreground">
              Archiving retains personal details, student profile, guardians,
              notes, and activity history. Restore before making changes.
            </p>
          </ActionForm>
        </section>
      )}
      <Link
        href={base}
        className="inline-block text-sm font-medium text-primary underline"
      >
        {studentFirst ? "Back to students" : "Back to contacts"}
      </Link>
    </div>
  );
}
