# Forma — local CRM/LMS platform

Next.js/TypeScript, Tailwind/shadcn, and local Supabase. Implemented domains: Auth, business/branch workspaces, employees, tenant roles, invitations, confidential salary configuration, a student-first contact workflow (Step 6F), Sales CRM, financial management through Steps 6A–6E, and the Step 7A course catalog/classrooms. Finance includes cashboxes, invoices/receivables, payments/credit, expenses, transfers, refunds, corrections, dashboard and CSV reports. LMS groups/enrollments/lessons, external messaging/payment integrations, statutory accounting and payroll calculation/payouts remain unimplemented.

For education businesses, start at **[Students](http://127.0.0.1:3000/students)**. **Add Student** saves the shared identity and student profile in one form and opens a unified profile with guardians, notes, activity and authorized invoices/payments/refunds/debt/credit. **All contacts** provides secondary access to non-students. Existing customer URLs and financial IDs are preserved. See the [Step 6F inspection, architecture and testing walkthrough](docs/student-first.md).

Local Docker/Supabase is configured. Native database tests and real local Auth/API/server-form tests cover the preceding modules and sales forms, follow-ups, loss/reopening, and transactional customer conversion. Browser dragging/rollback visuals, mobile/keyboard QA, native confirmation dialogs, and recovery-email link redemption remain manual. See [verification](docs/verification.md) for exact results and limits.

**Courses** now provides a shared business catalog with custom categories/levels, duration, exact UZS pricing templates, edit/archive/reactivate and history. **Classrooms** provides real branch resources with capacity and scoped management. These operations create no charges or student records. See the [7A schema, permissions and manual walkthrough](docs/lms-course-catalog.md). Groups, enrollments, schedules and the academic dashboard await later increments.

## Start locally

Requirements: Node 22.13+ in the 22.x line recommended, npm 10+, Git, Docker Desktop with Linux containers / WSL 2. The project already pins Supabase CLI; no hosted project is needed. Use `npm.cmd` / `npx.cmd` in PowerShell if execution policy blocks shorthand commands.

```powershell
npm ci
# Install/start Docker Desktop first.
npm run db:start
npm run db:status
```

If absent, copy `.env.example` to `.env.local`; preserve configured files. Populate the public key from **local** `db:status`:

```dotenv
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key or legacy anon key>
```

Never use secret/service-role keys in public variables. Keep URLs local. Use the same browser and hostname for requesting/redeeming recovery links because PKCE needs its verifier cookie.

```powershell
npm run db:migrate
npm run db:lint
npm run db:test
npm run db:types
npm run check
npm run dev
```

App: http://127.0.0.1:3000; Studio: http://127.0.0.1:54323; email inbox: http://127.0.0.1:54324. Restart Next.js after environment changes. Port changes require matching Auth site URL/callback allowlist changes in `supabase/config.toml`. No users/businesses/employees are seeded. Missing configuration shows setup guidance; protected routes still require Auth.

## Implemented pages

Sales pages are `/sales`, `/leads`, `/sales/board`, `/leads/new`, `/leads/[lead]`, `/leads/[lead]/edit`, `/sales/follow-ups`, `/sales/reports`, `/sales/settings/pipelines`, and `/sales/settings/sources`. See the [sales walkthrough](#sales-crm-step-5) for permissions, cohorts and manual QA.

| Pages                                                                                          | Implemented behavior                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`                 | Email/password Auth, profiles, PKCE recovery, validated callback destinations                                                                          |
| `/businesses`, `/businesses/new`, `/dashboard`                                                 | Authorized selection; atomic business/Owner/first branch creation; actual workspace information                                                        |
| `/branches`                                                                                    | Create/edit and activate/deactivate in authorized scope                                                                                                |
| `/courses`, `/courses/new`, `/courses/[course]`, `/courses/[course]/edit`, `/courses/settings` | Shared catalog, category/level configuration, exact pricing templates, filtering/sorting/pagination and retained change history                        |
| `/classrooms`, `/classrooms/new`, `/classrooms/[classroom]`, `/classrooms/[classroom]/edit`    | Actual branch rooms, capacity, scoped create/edit/deactivate/reactivate and retained history                                                           |
| `/customers`, `/students`, `/customers/archived`                                               | Search/filter/sort/page authorized contacts, student-only contacts, or archived records; counts and current-branch default                             |
| `/customers/new`, `/customers/[customer]/edit`                                                 | Shared contact, optional student profile, branch/tag/employee assignment, validated custom fields, duplicate suggestions                               |
| `/customers/[customer]`                                                                        | Overview, protected notes/interactions, immutable activity, normalized guardians, archive/restore; future payment/LMS sections contain no fake records |
| `/customers/settings`                                                                          | Tenant-specific statuses, tags, and text/number/date/boolean field definitions                                                                         |
| `/employees`                                                                                   | RLS-filtered directory, search, branch/status filters, pagination and loading state                                                                    |
| `/employees/new`, `/employees/[employee]/edit`                                                 | Profile, contact/job/start date/notes, status, multiple branch assignments                                                                             |
| `/employees/[employee]`                                                                        | Details/timestamps, confidential compensation/audit, Owner invitations, soft archive                                                                   |
| `/roles`                                                                                       | System catalog, custom roles/permission sets, account role and per-branch overrides                                                                    |
| `/invite/[token]`, `/invitations/accept`                                                       | Pending cookie, matching-account preview/accept/dismiss                                                                                                |
| `/team`                                                                                        | Owner enrollment of registered accounts; existing membership edits link to `/roles`                                                                    |
| `/settings`                                                                                    | Own profile and permitted business contact/currency/timezone updates                                                                                   |
| `/setup`, `/modules/*`                                                                         | Setup guidance and protected future-module placeholders                                                                                                |

Forms use real Supabase queries/RPCs, server validation, pending/error/success feedback, and the existing responsive design system. No runtime fixture data or service-role client exists. Visual/mobile QA remains pending.

## Permissions

Seven default roles exist per tenant: Owner, Admin, Branch Manager, Sales Manager, Cashier, Teacher, Employee; existing Staff memberships retain a legacy role. System roles are immutable. Custom roles have immutable business/branch scope and explicit catalog grants. Administrators cannot delegate permissions they lack; branch roles cannot grant `roles.manage`. Future-module permissions create no working modules.

| Role                    | Current access                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Owner                   | Full own-business access; invitations/new account enrollment; canonical ownership protected                        |
| Admin                   | Broad employee/salary/branch/role management; existing memberships only; no Owner-only invitations/enrollment      |
| Branch Manager          | Employee/branch/classroom management in assigned branches; shared course catalog read; no salary access by default |
| Sales Manager / Cashier | Existing sales/finance permissions within assigned branches                                                        |
| Teacher                 | Shared course catalog and assigned-branch classroom read; no academic management or financial/salary grants        |
| Employee / legacy Staff | Assigned active branch access; no HR/salary/role management by default                                             |
| Custom role             | Explicit grants in its business or assigned branches                                                               |

Branch overrides replace branch-scoped defaults; business-wide grants remain global within that tenant. Different branches' permissions are never merged to authorize an operation elsewhere. An employee shared across branches requires the operation in **every assigned branch**, or business-wide permission. Unassigned employees require global permission. Changes check all old/new branches. Linked login assignment changes additionally require `roles.manage`.

Employee records do not require Auth accounts. Owner invitations link a matching confirmed-email account to the original employee. One account can belong to multiple businesses. Tokens are hash-only at rest, expire in seven days, are revocable/single-use, and cannot assign Owner. Replacement revokes the outstanding link. The raw link is shown once for **manual delivery**; automatic invitation email sending is not implemented. The pending HTTP-only cookie lasts one hour; reopen the original link if needed.

Inactive/archived linked employees immediately lose access in that business, including existing sessions; other business memberships stay independent. Archive retains records/assignments/history. Dedicated archive requires `employees.archive`; general edits require `employees.update`, and restoring/editing archived records also requires archive permission. Canonical Owner cannot be suspended/reassigned.

Salary types: fixed monthly, hourly, per-lesson, percentage, base plus bonus, or none. Amounts use `numeric(18,2)`, percentages `numeric(7,4)`, transported as decimal **strings**. Saving requires salary view+manage and atomically records previous/new settings, actor, time, reason. Reads require salary view across the employee scope. Salary tables have no client grants; checked RPCs are the only client access. Unauthorized pages/directory queries omit salary data. No salary calculation/payment exists.

## Schema and migration rules

Existing profiles, tenants, tenant memberships, branches, and branch memberships remain. Eight new tables: `permissions`, `business_roles`, `business_role_permissions`, `employees`, `employee_branches`, `employee_salary_settings`, `employee_salary_history`, `employee_invitations`. Memberships gain tenant-bound role references and branch overrides. Legacy enum/global role mappings remain compatibility data; the existing `private.has_permission` now uses tenant roles as the single engine.

Every new public table has RLS and explicit grants. Composite foreign keys prevent cross-tenant references; checked RPCs authorize writes. Salary/invitation tables have no direct API grants. Populated-upgrade tests cover membership/branch preservation; no reset was run.

Create future migrations with `npx supabase migration new descriptive_name`; apply locally, test, regenerate types. Do not rewrite a shared/applied migration. `database.types.ts` is now generated against the actual local Supabase schema. `schema.ts` refines nullable RPC arguments; JSON parsers validate compensation/invitation results.

`supabase db reset` **deletes/recreates local records** and is absent from normal setup. `db:migrate` preserves records. `db:stop` preserves local data; do not add `--no-backup` for ordinary shutdown.

## Checks

| Command                                    | Purpose                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm run check`                            | ESLint, strict TypeScript, portable tests, production build                     |
| `npm run format:check`                     | Formatting                                                                      |
| `npm run test:smoke`                       | HTTP checks against app on port 3000                                            |
| `npm run test:integration`                 | Real local Auth/PostgREST/authenticated HTML; requires configured stack and app |
| `npm run db:lint` / `db:test` / `db:types` | Native database lint / pgTAP / generated types                                  |

Portable tests apply real migration SQL in embedded PostgreSQL with a minimal Auth contract. PGlite is an isolated test harness, never the app database. Native pgTAP and live integration independently exercise real local Supabase. Full live runs create sixteen real local test accounts plus isolated business/employee/salary/customer/guardian/sales/finance/invoice records and leave them for inspection; use a development database. Customer, sales, cashbox and invoice suites submit rendered Next.js forms over HTTP with real Auth cookies; they do not automate browser rendering or client-side controls.

## Manual feature walkthrough after local setup

1. Register Owner A, create Business A and two branches. Verify selection, settings, persistence, logout/login, and recovery using the local inbox.
2. Add an employee without a login. Set contact/job/start date/notes and two branches; search/filter/edit, deactivate/reactivate, inspect timestamps. Archive and restore; confirm history remains.
3. Configure all five salary types with change reasons, inspect old/new history, clear settings, reload, and verify exact decimal values. No payroll totals should appear.
4. Create branch Viewer (`employees.view`, `branches.view`) and Editor (also `employees.update`) roles. Assign a second account different roles per branch on `/roles`. Shared employees require view in both branches and edit in both to edit. Unassigned-branch employee UUIDs must remain unavailable.
5. Create an active employee with invitee email/branches, generate a non-Owner invitation, manually open it in that person's browser, log in/register with matching email, and accept. Confirm the existing employee links to the account. Test wrong email, revocation, expiration, replay, and denied Owner assignment.
6. As Manager/Employee without salary grants, confirm salary/history are absent from page HTML and raw RPC/table reads fail. Test direct mutations, self-promotion, and foreign tenant/branch/employee IDs in requests.
7. Create Business B with another Owner and reuse one invited Auth account across A/B. Confirm independent roles and two-way isolation. Deactivate/archive A's employee during an open session: A access must stop; B access must remain. Admin may manage existing roles but cannot issue Owner-only invitations/enroll accounts.
8. Complete browser/mobile/keyboard/loading/error/success QA and all existing Auth/business/branch/profile forms. Run native/live suites before claiming end-to-end readiness.

Local Auth auto-confirms registration by default. If confirmation is enabled, use the local inbox; the live suite expects default immediate-session registration. Invitations are manually delivered links, while password recovery uses local email.

Feature code lives under `src/features/auth`, `workspace`, `employees`, `customers`, `sales`, and `finance`, with reusable forms/queries/actions and shared components. The source repository is [voxid57d/crm](https://github.com/voxid57d/crm), using the `main` branch. Local environment files, dependencies, build output, and Supabase runtime state are ignored by Git. The application remains local-only; no deployment has been configured. No dependencies were added this phase. See [architecture](docs/architecture.md) and [verification](docs/verification.md) for automated coverage and remaining browser QA.

## Customer & student workflows (Step 4)

`customers` holds the single contact identity; `student_profiles` is an optional one-to-one extension. Student contact edits update the same customer. Existing student profiles are retained when studies end: use education status (prospective/active/on hold/completed/withdrawn), rather than deleting student history. Customer relationship statuses are separately configurable and are not sales funnel stages.

Twelve added tables: `customers`, `student_profiles`, `customer_branches`, `customer_statuses`, `customer_tags`, `customer_tag_links`, `customer_notes`, `customer_activities`, `guardians`, `student_guardians`, `customer_field_definitions`, `customer_field_values`. Three additive migrations seed five statuses for existing/new businesses, extend default roles, implement transactional RPCs/RLS, and keep unlinked guardian contacts reusable by business-wide users. No reset is required.

Customer permissions reuse `customers.view/create/update` and add `customers.archive`, `customers.manage_tags`, `customers.manage_settings`, `customers.view_notes`, `customers.manage_notes`. Owner/Admin have all customer grants. Branch Manager and Sales Manager have branch-scoped customer view/create/update and note view/manage; archive and catalog configuration require explicit additional grants. Other defaults gain no customer access. Settings/tag management requires business-wide permission even if a branch role includes that catalog key.

Shared customer records follow the same all-assigned-branches rule as employees. Reads and each mutation require that operation globally or in every assigned branch; moves check old/new assignments. Unassigned records require global permission. The directory defaults to the workspace's selected branch, supports an explicit all-authorized-branches filter, and rechecks submitted IDs. Profile edits act on the displayed record's explicit assignments, not an inferred cookie branch. Responsible employees are active same-tenant HR records sharing at least one customer branch; a checked choices RPC exposes only names/IDs within the actor's customer scope, never salary/HR details.

Notes/interactions live outside the contact row and require both customer view and note-view permission. Creating/editing additionally requires note-management permission; only the verified original author may edit. Before/after note text is retained in notes-only audit events, protected by the same note-view requirement. No direct client insert/update/delete grants exist on customer or audit tables. Activity includes verified actor name/ID/time, contact/status/branch/responsible/tag/custom/student changes and guardian operations. Audit history cannot be edited or erased through the application.

Guardian contacts are normalized per tenant; relationships carry student-specific relationship/emergency flags. A guardian can serve siblings. Branch users discover contacts only through authorized linked students, while business-wide users may reuse unlinked contacts. Changing shared contact details requires view/update access to every linked student; editing one relationship leaves other relationships intact. Unlinking preserves the contact and audit history. No parent portal exists.

Duplicate checks suggest up to ten visible matching email/normalized-phone/full-name contacts, including archived records. They neither block shared numbers nor merge records. Custom fields support optional text (2,000 characters), plain exact decimal strings (16 integer/6 fractional digits), calendar dates, and yes/no values. Definitions belong to the tenant, field type is immutable, and inactive definitions retain prior values. This is not a universal form builder.

### Manual customer walkthrough

1. As Owner, open `/customers/settings`; create a tag, optional custom status, and fields of each type. Keep the default status active. Make an HR employee assigned to a branch if you want a responsible employee choice.
2. Open `/customers/new`, check possible duplicates, create a contact with required first name/phone and optional fields left blank. Assign one/two branches, status, tag, responsible employee, and custom values. Enable student profile and provide a unique tenant student identifier when appropriate.
3. Reload the profile; edit it; check name/email/normalized-phone search, every filter, sorting, pagination, counts, and `/students`. Switch workspace branch and confirm the default directory filter changes. Use All authorized branches to see the full permitted set.
4. Record a call/note, edit your own note, and inspect old/new text and actor/time in Activity history. Another author's note cannot be edited. A role with customer view but without note view must see neither note text nor note-only history in page HTML or raw API responses.
5. Add two student siblings and link one guardian to both. Update the shared contact, change relationship/emergency per student, unlink/reuse it, and verify no duplicate contact is created. A user with access to only one sibling cannot edit the shared contact.
6. Give a staff account Viewer in branch A and Editor in B. A shared A+B customer is readable only with view in both and editable only with update in both. Try valid foreign customer/branch/status/tag/field/guardian IDs; database and server checks must reject them.
7. Archive a customer, open Archived, inspect retained student/guardian/note/history, then restore. Ordinary staff without archive grants must fail even via direct RPC. Create the same phone twice: both records are allowed and suggested as possible matches.
8. Complete responsive/mobile/keyboard and client-side student-toggle QA in a browser. Payments and Courses/Lessons sections must remain clearly reserved with no fabricated records.

Step 5 now references these shared customer identities for lead conversion. No code or data was deployed online in Step 4 or Step 5.

## Sales CRM (Step 5)

Open `/sales` for the dashboard, `/leads` for the table, `/sales/board` for Kanban, `/leads/new` for entry, `/leads/[lead]` for profiles, `/sales/follow-ups` for activities, `/sales/reports` for breakdowns, and `/sales/settings/pipelines` or `/sales/settings/sources` for business configuration. Sidebar links and `/modules/leads` lead to the real module. Current-branch selection defaults the filters; All authorized branches is an explicit alternative.

### Sales data and permissions

Five additive migrations add nine RLS-protected tables: `sales_pipelines`, `sales_stages`, `lead_sources`, `lead_loss_reasons`, `leads`, `lead_notes`, `lead_activities`, `lead_followups`, and `sales_configuration_history`. The later migrations protect pending task scope during branch moves and enforce outcome integrity/indexes. Existing customers, students, guardians, HR records, roles and history are preserved. Local schema types are regenerated; no reset or hosted project is needed.

Each lead has exactly one tenant-bound branch, a pipeline/stage, raw and normalized phone, optional secondary phone/email/service/source/employee, priority, and outcome. Phone/email duplicates are allowed and suggested on profiles. Leads, sources, stages and outcomes never use customer-status IDs. Notes are append-only related records, not a second conflicting contact copy. Next follow-up is derived from the earliest pending activity, not an independently editable date that can drift.

All writes use checked RPCs and current server Auth/workspace checks. Existing `leads.view`/`leads.manage` catalog entries are retained; fine-grained grants are `leads.create`, `leads.update`, `leads.archive`, `leads.assign`, `leads.change_stage`, `leads.convert`, `leads.manage_pipelines`, `leads.manage_sources`, `leads.view_analytics`, `leads.manage_followups`. Existing broad legacy role grants are backfilled to record operations; they do not independently bypass RPC checks. New custom roles must select explicit operations.

Owner/Admin receive all sales grants. Branch Manager/Sales Manager receive branch-scoped view/create/update/assign/stage/convert/follow-up/analytics grants; archive and configuration are not granted automatically. Other default roles gain no sales authority. Configuration requires business-wide grants. Sales visibility is permission plus tenant/branch scope, not a rule that every employee sees only their own assignments. Employee/date/priority filters narrow the view; they never authorize it. An eligible assignee must be an active, CRM-linked HR employee whose current membership role permits sales work in that branch. Offline/non-sales employees are not assumed to be salespeople. The same linked employee may be eligible in multiple branches.

### Pipelines, Kanban and activity

The default pipeline is New Lead → Contacted → Interested → Trial Scheduled → Trial Completed → Negotiation → Converted, plus Lost/Disqualified. Additional pipelines start with basic open/converted/lost/disqualified stages and can be customized for any industry. Administrators rename/add/deactivate/color stages, reorder them with accessible up/down controls, and configure sources/loss reasons. Existing stage outcome/pipeline cannot change; stage deletion is not exposed, even with leads. Every settings change has protected configuration history. Deactivated source/stage references stay on historical leads.

Kanban shows up to20 recently updated matching cards per stage, with **exact full-filter column counts** and a link to a paginated stage table. It uses native HTML drag/drop without extra dependencies, and a select-and-Move fallback for keyboard/touch users. Accepted moves call the same server action/RPC as profile moves, with the expected prior stage to reject stale updates. Failed calls restore the prior client cards/counts and show an error. Lost/disqualified moves collect an active loss reason in a shadcn Sheet before saving. Converted stages require the conversion workflow so dragging cannot bypass customer selection.

Lead activity retains creation/contact changes, stage and pipeline changes, assignments, communications, follow-up edits/completion, lost/disqualified/reopening outcomes and conversion references, with verified actor identity/name/time. Tenant users cannot directly alter/delete notes or audit rows. Sales viewers can read notes on leads in their authorized scope; this phase does not define a separate sales-note permission. Archive hides the record from default lists without deleting anything; restore permits editing again. Converted contact data is frozen to preserve the conversion trace; communications/follow-up completion can still be recorded.

### Follow-ups and conversion

Follow-ups support phone call, meeting, message, trial-lesson activity and general follow-up. They store one responsible eligible sales employee, description, UTC timestamp, pending/completed state, completion actor/time and outcome notes. Forms interpret local input in the business timezone and store an explicit-offset timestamp. Invalid calendar dates and DST gaps are rejected. Ambiguous DST times use the valid offset selected by timezone conversion; inspect the displayed business-local time when using DST zones. Pending activities can be edited; completed outcomes are retained. Moving a lead's branch is blocked if a pending task would leave its assignee unauthorized in the new branch. No reminders or actual lesson entities are created.

Conversion checks `leads.convert`, current lead scope/status, and customer permissions. It shows visible possible customer matches and a customer search. Link an active authorized customer already associated with the lead's branch, or create a contact from the lead. A new contact requires customer view/create in that branch; matching contacts require a deliberate separate-contact confirmation if you still choose new. Linking never overwrites an existing customer's contact details or silently expands its branches. Shared customers keep Step4's all-assigned-branches access rule. Hidden customers cannot be disclosed by duplicate checking.

Conversion locks tenant then lead and creates/links the customer, records the conversion, changes stage and appends both histories atomically. Repeat requests return the original customer; concurrent requests cannot create two contacts. Failures roll back the whole operation. Original lead/source/employee/pipeline/history remains traceable. Lost/disqualified leads need authorized reopening first. There is no conversion undo, automatic student profile, course enrollment or payroll/payment action.

### Metrics and manual sales walkthrough

Reports use **non-archived leads created in the selected inclusive business-local date range**, further restricted by current lead-view and analytics permission in each branch and chosen filters. Total is that cohort's size; Converted is its current converted outcome; conversion rate = Converted / Total ×100 (0 for an empty cohort). Lost includes disqualified, with a separate disqualified count available in the data. New means currently open in the pipeline's first active open stage. Overdue is pending activities due before DB `now()` on that same lead cohort. Source/stage/employee/branch breakdowns and creation-day trends aggregate only that cohort. Conversion-date populations are not mixed with creation-date totals.

1. Log in as Owner and create a pipeline/source/loss reason under Sales settings. Rename/color a stage, reorder with up/down and save; deactivate an unused option and reload to verify persistence.
2. Add a lead without email. Select branch/source/priority and an eligible sales employee. If none appears, create the HR record, invite/link its account, and grant sales work in that branch. Search/filter it in Table and Kanban; test another branch and Unassigned filter. Shared phones must not prevent another lead entry.
3. Drag between open stages, reload, and confirm timeline entries. Use Move as a keyboard/touch alternative. Test stale state by moving the same lead in another session before submitting an old expected stage; a rejected move must retain the server position and restore the client display.
4. Record calls/notes, schedule a business-local follow-up, edit it while pending, view Upcoming/Overdue/Completed filters, then record its completion outcome. Confirm card indicators and audit actors/times. A branch move must not strand a pending task with an unauthorized employee.
5. Move to Lost/Disqualified with an active reason, inspect actor/time/notes, then reopen to an active open stage. History must remain. Archive/restore from the profile and use the Archived table filter; no permanent deletion exists.
6. Convert a lead to a new customer, inspect both profiles, then repeat the request to confirm the same customer. Create another enquiry with the same phone and link the existing match instead of duplicating it. Try a foreign-tenant/branch customer ID and a caller lacking customer-create or lead-convert permission.
7. Compare Sales Dashboard/Reports with database records using the documented creation cohort. Use separate browser profiles for Owner, branch sales staff and view-only staff; test branch/lead/tenant IDs through real requests as well as hidden controls.
8. Complete manual pointer dragging, rollback visuals, mobile overflow, keyboard/focus, confirmation dialogs and timezone/DST edge QA. These browser interactions have not been automated here.

Reproduce checks with `npm run check`, `npm run db:test`, `npm run test:smoke`, and (with local app running) `npm run test:integration`. `typecheck` runs `next typegen` before TypeScript. Live integration creates real local Auth accounts and isolated fixture businesses/records and leaves them for inspection. No external messaging, automated reminders, deployment, online payment gateway or LMS enrollment is configured. Current financial workflows and remaining browser QA are described below.

## Cashboxes and ledger foundation (Step 6A)

Open **Finance → Cashboxes**, or [http://127.0.0.1:3000/finance/cashboxes](http://127.0.0.1:3000/finance/cashboxes). The existing local stack and app are sufficient; no additional dependency or manual service configuration is required for this increment.

- Create branch-specific or business-wide cashboxes, edit name/type/status, and retain inactive history. Scope and currency stay fixed.
- View exact current balances derived from immutable ledger movements. Search/filter/sort cashboxes and paginate real records.
- With `cashboxes.adjust`, post a positive first-only opening balance or a signed adjustment with a reason. Zero, excess precision, duplicate request changes and overdrafts are rejected. Each posting is transactional and idempotent.
- Filter posted history by inclusive business-local dates, type and recorder. With `finance.audit.view`, inspect separate append-only configuration/posting audit events.

Owner/Admin have full own-business cashbox access. Branch Managers view/manage assigned branches; Cashiers view their assigned cashboxes. Adjustments/audit require separate grants. Teacher/Employee have no financial access by default. RLS, checked server actions/RPCs and tenant/currency foreign keys enforce these rules independently of UI controls.

Three additive migrations (`20261023000900`–`20261023001100`) add the currency catalog, cashboxes, transaction envelopes, exact signed ledger entries and audit events. UZS uses two fractional places. Amounts travel as strings; PostgreSQL does all monetary arithmetic. No editable balance or debt columns exist.

Try an opening of **100.10 UZS** followed by **-0.10 UZS**: expect **100.00 UZS** and both history entries. Try zero, three decimal places and an adjustment below zero; nothing should post. Deactivate/reactivate, check retained history, then test another business/branch account. The detailed [finance architecture and walkthrough](docs/finance.md) covers each permission, constraint, manual test and future extension.

The cashbox contract above remains in use and now includes payments, expenses, refunds, transfers and reversal movements. Negative balances are blocked by default; only the actual business owner can change a cashbox's overdraft policy with an audit reason. Visual/mobile/keyboard/confirmation-dialog browser QA remains manual. This is an operational ledger, not statutory accounting.

## Invoices and customer receivables (Step 6B)

Open **Finance → Invoices** at http://127.0.0.1:3000/finance/invoices. Create/edit drafts with real authorized customers and up to 100 exact line items. Save and review totals, then confirm issue to allocate the next business invoice number and create its receivable. Issued documents are immutable. Authorized voids retain the original and append the full offset; a linked replacement draft can be created for the same customer/branch. Draft discard preserves history without posting debt.

For a quick check, use quantity **1.5**, unit price **100.10**, line discount **0.15**, and invoice discount **10.00**. Expect subtotal **150.00 UZS**, total **140.00 UZS**, and no draft debt. Issue it: outstanding becomes **140.00 UZS**. Void with a reason: outstanding becomes **0.00 UZS**, while the original amount/number and both receivable entries remain. Cashbox balances must not change.

**Finance → Receivables** provides authorized debtor search, branch scope, exact outstanding/overdue sums and five aging buckets. Customer profiles link to financial summaries and invoice history. Multi-branch customers reuse one identity; every invoice owns one branch and is counted once. Converted sales leads can link to invoice creation, without automatic billing.

New permissions are `invoices.view`, `invoices.create` (also draft edit/discard), `invoices.issue`, `invoices.void`, and `debts.view`. Owner/Admin have full own-business access; Branch Managers view/create/issue/debts in assigned branches; Cashiers view invoices/debts; Teacher/Employee/Sales Manager have no access by default. Selecting customers requires existing CRM access, including all-assigned-branches checks for shared contacts. Detailed audit snapshots use existing `finance.audit.view`.

Five additive migrations (`20261023001200`–`20261023001600`) introduce four RLS-protected invoice/receivable tables and extend the shared financial audit stream. Amounts/quantities travel as decimal strings; all monetary calculations use PostgreSQL NUMERIC. No editable debt column or cash posting is introduced. The authenticated print view supports browser Print / Save PDF; actual PDF rendering, print pagination and visual/mobile/keyboard/confirmation QA remain manual.

See the [invoice architecture](docs/invoices.md) and [verification results](docs/verification.md). Paid/partially-paid/overdue states now derive from actual allocations. Voiding an allocated invoice requires releasing its active allocations first. No automated course charge or LMS enrollment is implemented.

## Test complete financial workflows (Steps 6C–6E)

Use the existing local environment: `npm run db:start`, `npm run db:migrate`, then `npm run dev` if port 3000 is not serving the app. Migrations create the private receipt bucket/policies without a reset. No new dependency or hosted project is needed. Open **http://127.0.0.1:3000**, sign in and select your business/branch.

1. Create two cashboxes. Create a customer and issue an invoice for **100.00 UZS**.
2. Under **Payments → Record payment**, receive **60.00**, allocating **40.00** to the invoice. Expect cash **60.00**, debt **60.00**, credit **20.00**. Allocate another **10.00** on the payment page: debt **50.00**, credit **10.00**, cash unchanged.
3. Post an expense of **5.00** from the first cashbox with an active category and description. Cash becomes **55.00**. Open the expense to attach an optional private PDF/image receipt. Owner/Admin can configure categories.
4. Transfer **10.00** to the second cashbox. Balances become **45.00** and **10.00**, combined **55.00**. Excessive transfers fail without saving either leg.
5. Refund **20.00** from the first cashbox on the original payment page. It consumes **10.00** credit and releases **10.00** of allocations. Expect debt **60.00**, credit **0.00**, combined cash **35.00**. Original payment and refund/release histories remain. Further refunds cannot exceed the remaining original payment.
6. Open the expense's posting and reverse it with a reason. The **5.00** outflow is offset, retaining the original. Combined cash becomes **40.00**. A second reversal is rejected. Payments use linked refunds.
7. Open **Finance**, select a period covering these operations and all authorized scopes. Expect gross received **60.00**, refunds **20.00**, net collections **40.00**, net expenses **0.00**, current debt **60.00**, current cash **40.00**. Opening balances/transfers do not inflate collections. Invoice totals are separate from collected cash; no metric is accounting profit.
8. Open **Reports**, run the ten reports and export CSV. Choose a customer for their statement. Date filters use the business timezone. Exports cap at 5,000 rows; narrow filters for larger results. Import decimal columns as text into spreadsheets to preserve large exact values.
9. Test another business and an assigned-branch account in separate browser profiles. Branch Managers operate in assigned branches; Cashiers receive/allocate but cannot refund by default. Employees/Teachers have no finance access unless granted. Altering IDs, filters or cookies cannot authorize an operation.

Details: [payments](docs/payments.md), [financial operations](docs/financial-operations.md), [dashboard/reports](docs/financial-reports.md), [verification](docs/verification.md). All calculations use PostgreSQL NUMERIC and exact string API amounts. Posting history is immutable; balances/debt derive from history. Server actions and database RPCs/RLS enforce tenant/branch permissions. Private receipts use Auth-based Storage policies; no service-role credential reaches the browser.
