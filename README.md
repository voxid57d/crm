# Forma — local CRM/LMS platform

Next.js/TypeScript, Tailwind/shadcn, and local Supabase. Implemented domains: Auth, business/branch workspaces, employees, tenant roles, invitations, and confidential salary configuration. Customers, payments, LMS, and payroll calculation remain unimplemented.

**Verification limit:** Docker is absent and the local public key is blank. The build, 52 portable tests, and unauthenticated HTTP checks pass; authenticated local Supabase and browser workflows remain unverified. See [verification](docs/verification.md).

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

| Pages                                                                          | Implemented behavior                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` | Email/password Auth, profiles, PKCE recovery, validated callback destinations                   |
| `/businesses`, `/businesses/new`, `/dashboard`                                 | Authorized selection; atomic business/Owner/first branch creation; actual workspace information |
| `/branches`                                                                    | Create/edit and activate/deactivate in authorized scope                                         |
| `/employees`                                                                   | RLS-filtered directory, search, branch/status filters, pagination and loading state             |
| `/employees/new`, `/employees/[employee]/edit`                                 | Profile, contact/job/start date/notes, status, multiple branch assignments                      |
| `/employees/[employee]`                                                        | Details/timestamps, confidential compensation/audit, Owner invitations, soft archive            |
| `/roles`                                                                       | System catalog, custom roles/permission sets, account role and per-branch overrides             |
| `/invite/[token]`, `/invitations/accept`                                       | Pending cookie, matching-account preview/accept/dismiss                                         |
| `/team`                                                                        | Owner enrollment of registered accounts; existing membership edits link to `/roles`             |
| `/settings`                                                                    | Own profile and permitted business contact/currency/timezone updates                            |
| `/setup`, `/modules/*`                                                         | Setup guidance and protected future-module placeholders                                         |

Forms use real Supabase queries/RPCs, server validation, pending/error/success feedback, and the existing responsive design system. No runtime fixture data or service-role client exists. Visual/mobile QA remains pending.

## Permissions

Seven default roles exist per tenant: Owner, Admin, Branch Manager, Sales Manager, Cashier, Teacher, Employee; existing Staff memberships retain a legacy role. System roles are immutable. Custom roles have immutable business/branch scope and explicit catalog grants. Administrators cannot delegate permissions they lack; branch roles cannot grant `roles.manage`. Future-module permissions create no working modules.

| Role                              | Current access                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Owner                             | Full own-business access; invitations/new account enrollment; canonical ownership protected                   |
| Admin                             | Broad employee/salary/branch/role management; existing memberships only; no Owner-only invitations/enrollment |
| Branch Manager                    | Employee view/update and branch management in assigned branches; no salary access by default                  |
| Sales Manager / Cashier / Teacher | Limited assigned-branch access plus future-module catalog permissions                                         |
| Employee / legacy Staff           | Assigned active branch access; no HR/salary/role management by default                                        |
| Custom role                       | Explicit grants in its business or assigned branches                                                          |

Branch overrides replace branch-scoped defaults; business-wide grants remain global within that tenant. Different branches' permissions are never merged to authorize an operation elsewhere. An employee shared across branches requires the operation in **every assigned branch**, or business-wide permission. Unassigned employees require global permission. Changes check all old/new branches. Linked login assignment changes additionally require `roles.manage`.

Employee records do not require Auth accounts. Owner invitations link a matching confirmed-email account to the original employee. One account can belong to multiple businesses. Tokens are hash-only at rest, expire in seven days, are revocable/single-use, and cannot assign Owner. Replacement revokes the outstanding link. The raw link is shown once for **manual delivery**; automatic invitation email sending is not implemented. The pending HTTP-only cookie lasts one hour; reopen the original link if needed.

Inactive/archived linked employees immediately lose access in that business, including existing sessions; other business memberships stay independent. Archive retains records/assignments/history. Dedicated archive requires `employees.archive`; general edits require `employees.update`, and restoring/editing archived records also requires archive permission. Canonical Owner cannot be suspended/reassigned.

Salary types: fixed monthly, hourly, per-lesson, percentage, base plus bonus, or none. Amounts use `numeric(18,2)`, percentages `numeric(7,4)`, transported as decimal **strings**. Saving requires salary view+manage and atomically records previous/new settings, actor, time, reason. Reads require salary view across the employee scope. Salary tables have no client grants; checked RPCs are the only client access. Unauthorized pages/directory queries omit salary data. No salary calculation/payment exists.

## Schema and migration rules

Existing profiles, tenants, tenant memberships, branches, and branch memberships remain. Eight new tables: `permissions`, `business_roles`, `business_role_permissions`, `employees`, `employee_branches`, `employee_salary_settings`, `employee_salary_history`, `employee_invitations`. Memberships gain tenant-bound role references and branch overrides. Legacy enum/global role mappings remain compatibility data; the existing `private.has_permission` now uses tenant roles as the single engine.

Every new public table has RLS and explicit grants. Composite foreign keys prevent cross-tenant references; checked RPCs authorize writes. Salary/invitation tables have no direct API grants. Populated-upgrade tests cover membership/branch preservation; no reset was run.

Create future migrations with `npx supabase migration new descriptive_name`; apply locally, test, regenerate types. Do not rewrite a shared/applied migration. Checked-in `database.types.ts` currently describes SQL manually; actual Supabase generation is pending. `schema.ts` refines nullable RPC arguments; JSON parsers validate compensation/invitation results.

`supabase db reset` **deletes/recreates local records** and is absent from normal setup. `db:migrate` preserves records. `db:stop` preserves local data; do not add `--no-backup` for ordinary shutdown.

## Checks

| Command                                    | Purpose                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm run check`                            | ESLint, strict TypeScript, portable tests, production build                     |
| `npm run format:check`                     | Formatting                                                                      |
| `npm run test:smoke`                       | HTTP checks against app on port 3000                                            |
| `npm run test:integration`                 | Real local Auth/PostgREST/authenticated HTML; requires configured stack and app |
| `npm run db:lint` / `db:test` / `db:types` | Native database lint / pgTAP / generated types                                  |

Portable tests apply real migration SQL in embedded PostgreSQL with a minimal Auth contract. PGlite is an isolated test harness, never the app database, and does not prove Auth/SMTP/browser behavior. The live suite creates four real local test accounts plus business/employee/salary records per run and leaves them for inspection; use a development database.

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

Feature code lives under `src/features/auth`, `workspace`, and `employees`, with reusable forms/queries/actions and shared components. The source repository is [voxid57d/crm](https://github.com/voxid57d/crm), using the `main` branch. Local environment files, dependencies, build output, and Supabase runtime state are ignored by Git. The application remains local-only; no deployment has been configured. No dependencies were added this phase. Complete Docker-backed integration, type generation, and browser QA before the next module. See [architecture](docs/architecture.md) and [verification](docs/verification.md).
