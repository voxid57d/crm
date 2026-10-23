# Verification record — 22 October 2026

## Baseline and environment

Inspected before changes: Next.js 16.4.2/React 19.3.1, strict TypeScript, Tailwind4/shadcn, local Supabase configuration, three migrations, Auth, business onboarding/selection, branch management, profiles, Owner enrollment, and 36 portable tests. Baseline `npm run check` passed. Previous live Auth/database checks were already blocked by missing Docker.

Available: Node22.12/npm10.9/Git2.47.1/project-local Supabase CLI2.121.0. Docker/Podman absent. No dependencies added, hosted service connected, remote/commit/push/deployment created, or database reset/deletion run.

## Passed this phase

| Check                                    | Evidence                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                          | ESLint, strict TypeScript, **52** portable tests, optimized production build passed                                                                                                                          |
| `npm run test:smoke` against `npm start` | Four public pages render; all 21 protected routes redirect forged-cookie unauthenticated requests, including employee/profile/edit/roles/invitation paths                                                    |
| HTTP boundaries                          | Home redirect, missing admin/platform paths, invalid callback stays local; invitation format redirect, HTTP-only pending cookie and no-store                                                                 |
| Preserved SQL tests                      | Owner/defaults/integrity, transactional onboarding, profiles, branch CRUD/status, two-way isolation, suspension, multi-business membership, anonymous denial                                                 |
| New employee/role SQL tests              | Offline CRUD, multi-branch assignments, foreign IDs/branch denial, differing branch roles, all-branch HR coverage, delegation limits, system/Owner protection, independent archive permission                |
| Salary SQL tests                         | Five types/clearing, exact `9007199254740993.12` round trip, precision/percentage validation, atomic audit, unauthorized RPC/table reads and history mutation denial                                         |
| Invitation/status SQL tests              | Hash storage, Owner-only issue, confirmed matching email, wrong account/expiry/revocation/replay denial, original employee linking, no Owner assignment, multi-business account, inactive/archive revocation |
| Upgrade tests                            | Populated membership/assignment preservation; preceding owner/profile backfill and ownerless legacy rejection retained                                                                                       |

PGlite executes actual migration SQL with a minimal Auth users/roles/subject contract. It is an isolated harness, not the application datastore. An upgrade regression caught deferred-trigger events preventing ALTER on populated memberships; flushing constraints fixed it and the test passes. Portable tests do not prove actual Auth/PostgREST/SMTP/browser behavior.

## Failed prerequisites / unverified

| Check                                                             | Observed result                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `db:status`                                                       | CLI reports Docker/Podman absent                                                                                       |
| `db:lint`, `db:test`                                              | Connection refused at 127.0.0.1:54322; native pgTAP did not execute                                                    |
| `test:integration`                                                | Fails at blank `.env.local` public-key prerequisite; no live Auth/record operations ran                                |
| Actual Supabase migrations/type generation                        | Blocked by absent stack; checked-in types describe SQL manually, with nullable-RPC refinements and JSON result parsers |
| Browser inventory                                                 | No apps/browsers available; visual/mobile/keyboard QA unavailable                                                      |
| Authenticated employee/role/salary/invitation form workflows      | Implemented, not verified end to end on local Supabase/browser                                                         |
| Existing Auth/business/branch forms and recovery email redemption | Portable/build/unauthenticated HTTP coverage passes; real Auth/email/browser behavior remains unverified               |

The real-Supabase integration suite fails loudly on missing prerequisites. New scenarios include real employee CRUD, salary confidentiality through APIs/authenticated HTML, invitation acceptance with an existing account, and status revocation, but **have not run** here. It does not automate browser forms/email redemption. Native pgTAP employee tests also exist and remain unrun.

## Manual completion

1. Install/start Docker Desktop with Linux containers/WSL2; run `npm run db:start` and `db:status`.
2. Set the local public key in `.env.local`, preserving other values and loopback URLs. Never use a public service-role key.
3. Run `db:migrate`, `db:lint`, `db:test`, `db:types`; review generated types and rerun `npm run check`. No reset required.
4. Start `npm run dev`; in another terminal run `test:smoke` and `test:integration`. Integration creates four real local accounts plus disposable business/employee/salary records each run and leaves them for inspection.
5. Complete the [README walkthrough](../README.md#manual-feature-walkthrough-after-local-setup): all employee operations, salary types/audit, differing branch roles, new/existing-account invitations, denied salary/foreign IDs, revocation, recovery, preserved workspace flows.
6. Complete browser/mobile/keyboard QA before claiming UI readiness or expanding modules.

Invitations are manually delivered Owner-generated links, not automatic invitation emails. Recovery uses the local inbox. Default local Auth auto-confirms registration; if enabled, complete confirmation through the inbox. Live tests expect default immediate-session signup.

## Existing tooling findings

Historical initial audit: zero runtime vulnerabilities, nine high-severity development-tool findings through globbing dependencies ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)); this is not a fresh audit. Dependencies are unchanged. ESLint9 previously emitted an end-of-support deprecation, and transitive visitor-keys requires Node22.13+ versus installed22.12. Review a current Node22.x/lint upgrade separately; no forced downgrade or destructive cleanup was applied.
