# Step 6F — inspection and implementation plan

## Part A: inspected architecture

`customers` is the authoritative identity (name, phones, email, birth date, status, responsible employee). `student_profiles` has a composite primary/foreign key `(tenant_id, customer_id)` and a tenant-unique student identifier, plus education metadata. `customer_branches`, tags, custom values, notes and immutable activities all reference the same customer ID. `save_customer` already writes identity, student profile and assignments in one checked transaction. There is no separate student person/ID to migrate.

The `/students` directory reuses `customer_directory(p_students => true)`, but its add/profile links point to `/customers`. Creation offers an optional "This customer is a student" checkbox and redirects to a customer profile. Guardians and finance are already reusable profile sections. Existing finance summaries calculate debt/credit through checked SQL RPCs and must remain authoritative. An unauthorized profile currently shows obsolete "future payment" copy; this must become a permission message.

`convert_lead` serializes on tenant/lead, preserves sales history and links/creates one customer. It is idempotent for converted leads, but never creates a student profile. Existing converted leads must remain intact and receive an explicit student-profile action rather than a bulk conversion. Non-education conversion must retain its generic behavior.

`guardians` are reusable tenant contact records linked many-to-many by `student_guardians`; they are not automatically customers or students. Existing linking preserves their details. Shared edits require access to all linked students. Financial records reference the student's shared customer ID; payments do not identify a separate payer/guardian. Third-party payer attribution is a future additive feature, not a reason to change financial owners now.

RLS uses `private.customer_allowed`: business-wide grants or permission in **every** assigned branch. The student, notes, activities and guardian policies already reuse this engine. Financial scope remains independently checked. Existing non-student contacts, archived students and old customer URLs must remain available.

Baseline: clean Git tree, installed Next 16.4.2 guides read, strict typecheck and all 153 portable tests passed. Docker and the app were stopped on inspection; local service startup is part of verification. No dependencies are needed.

## Smallest safe changes

1. Reuse the directory with student-specific add/profile/archive links. Present generic Customers as secondary Contacts for education businesses; retain its routes and generic behavior for other businesses.
2. Add `/students/new`, `/students/[customer]`, edit and finance routes using shared contact/form/profile/finance components. Student forms always include an education profile; contact promotion reuses the original identity. Legacy customer pages remain functional.
3. Add narrow checked `save_student` and `convert_lead_to_student` RPC wrappers around existing saves/conversion. Add one small RLS-protected request-receipt table for safe retried student creation. This migration is necessary for database-enforced duplicate review, atomic contact promotion and idempotent requests; no core tables/records/identifiers or financial postings are renamed/deleted/rewritten.
4. Require duplicate review before creating a separate matching student/contact; offer explicit reuse. Shared phone numbers remain valid and matches are suggestions, never automatic identity merges. Generate a unique student identifier when omitted.
5. Education lead conversion creates/links a student atomically and opens its profile. Historical generic conversions can explicitly add a student profile without changing lead/customer IDs, attribution or existing finance. Existing generic conversion RPC remains available.
6. Reuse real invoice/payment/refund queries inside student finances and preserve independent finance permissions. Add a thin payment read adapter for roles without invoice/debt access. Provide overview, education, guardians, notes, finance, activity and a clearly reserved future learning section.
7. Test atomic failures/retries/concurrency, contact promotion with existing financial records, guardians, branch/tenant/finance denial and generic compatibility; rerun existing suites and local build. Document limitations and a manual walkthrough.

Affected areas: customer/student components and server actions/queries, lead conversion page/action, navigation/shell, thin student routes, additive migration/types, authorization/integration tests and documentation. Existing financial posting functions and tables are reused.

## Part B: implemented workflow

- `/students` is the education directory, with Add Student, archived students, real student status and a secondary All contacts link. For business type `education` (case-insensitive, the existing default), the sidebar's competing Customers entry is removed. Other business types retain generic customer navigation/conversion. `/customers`, its create/edit/archive/settings/profile/finance routes and `/modules/students` bookmarks still work.
- `/students/new` saves shared identity, branch assignments, education profile, tags and custom fields through one transaction and returns `/students/[customer]`. Student identifier is optional here; PostgreSQL generates a tenant-unique `ST-…` identifier when blank. The optional legacy education checkbox is absent. A failed student/branch/custom-field save leaves no incomplete contact or request receipt.
- Duplicate review is enforced during new student creation. Use the duplicate checker's matching contact/student link to open `/students/new?existing=…`. An existing student opens directly; an authorized non-student is promoted in place. Archived contacts must first be restored. Shared phones/emails remain valid for different people after explicit confirmation; no identity is automatically merged based on name or family phone.
- Edit via `/students/[customer]/edit`; common identity fields remain authoritative in `customers`. Existing student identifiers and history survive blank generated-ID fields and repeated submissions. Exact request receipts protect retries; a different payload with a used key is rejected. Tenant serialization also protects concurrent student/lead conversion.
- One shared profile component serves old contact bookmarks and student routes. Student profiles include overview, education metadata, guardians, notes, activity, linked authorized leads and embedded finances. Invoice, payment and refund histories paginate independently with anchors back to the same profile. Explicit financial subpages remain at `/students/[customer]/finance`. Course/group/lesson/attendance space is clearly reserved without academic data or enrollment creation.
- Finance reuses invoice/payment/refund queries and SQL credit/debt calculations. Invoice/debt permission controls invoice balances. A thin read-only `customer_payment_profile` adapter uses existing `private.payment_rows` for payment-only roles; those users can view authorized credit/payment/refund information without receiving invoices or debt. Users with no financial grants receive a restriction message and no financial amounts. CRM all-assigned-branch access remains required for a student profile; financial modules retain their existing independent branch rules.
- Education lead forms call `convert_lead_to_student` and redirect to the resulting student. Existing students/contacts can be linked; historic converted contacts have an explicit Add student profile action. Repeated conversion preserves the original ID, attribution, timestamps and existing profile rather than overwriting it. Default converted student status is `prospective`; this is CRM metadata, not course enrollment. Generic `convert_lead` behavior is preserved for non-education businesses/API callers.

## Database and data safety

Two additive migrations: `20261024002300_student_first_workflows.sql` adds the RLS-protected, client-inaccessible `student_save_requests` receipt table and narrow student save/conversion commands. `20261024002400_contact_payment_overview.sql` adds a read-only payment adapter to preserve independent permissions. Existing customer/student/guardian/finance tables, IDs, posted history, RLS and permission catalogs are retained. No backfill turns non-students into students. No invoice, payment, debt, refund, ledger or course record is automatically created during student creation/conversion.

The local inspection found zero orphan student profiles and zero guardian links missing their student profile. Duplicate names/phones may be legitimate and were not treated as corruption. If historical duplicate identities are discovered, identify the canonical customer ID, review all financial/guardian/sales references and obtain a reviewed migration/backup plan before any merge. This step performs no automatic merges or deletion.

Guardians retain their existing independent contact table and can be reused by multiple students. A student can have multiple guardians and emergency relationships. Paying an invoice never creates a student. There is no structured third-party payer relation yet: money remains attached to the billed student's customer identity; guardian payment responsibility/customer-to-guardian identity unification needs a separately reviewed feature. No broad financial redesign is included.

## Manual testing

1. Start Docker Desktop and run `npm run db:start`, `npm run db:migrate`, then `npm run dev` if port 3000 is not serving the app. Keep `.env.local` pointed at local Supabase. Open **http://127.0.0.1:3000/students**, sign in and select a business with type `education` and an authorized branch.
2. Click **Add Student**. Enter name/phone, choose branches/status and leave the identifier blank. Save once. Expect a student profile directly, one customer ID and a linked generated student identifier. No bill/enrollment is created.
3. Check possible matches with the same phone/name. Reuse an existing student, or use an existing non-student contact to add their profile. If the number belongs to a different family member, confirm a separate person. Invalid student status/custom values must fail without creating a partial contact.
4. Edit contact details/student status, add notes and check activity. Open the old `/customers/[id]` bookmark: it must show the same shared details. A promoted contact's original contact creation and later student-profile addition remain distinct in the timeline.
5. Add a guardian and mark emergency contact. On a sibling's profile, search and link that **existing** guardian. Both relationships reuse one guardian. No student record should be created for the parent by that action.
6. For a contact with invoice **100.00**, payment **60.10**, allocation **40.00**, and credit-only refund **5.00**, note debt **60.00** and credit **15.10**. Promote that contact to a student; all IDs, history and values must stay identical. Check inline invoice/payment/refund histories and independent pagination.
7. Convert a new education lead, link another lead to an existing student and retry conversion. Expect the same student ID and preserved sales attribution. On an old generic conversion, use **Add student profile** explicitly. In a non-education business, conversion should continue creating/linking an ordinary contact.
8. Test a branch reader without finance grants, then a payment-only reader, then an unauthorized branch and another business. Full shared students require all assigned branches. Guardians, notes, invoices and financial amounts must follow their existing permissions. Direct ID changes must fail.
9. Archive/restore a student using their profile. Check Students/Archived students and existing generic contact links. Review mobile layout, keyboard focus, duplicate-check interaction and native confirmation dialogs manually.

## Before Step 7

No existing enrollment/course/group/lesson/attendance model was added. Step 7 should reference `(tenant_id, customer_id)` on `student_profiles`, retain current tenant/branch rules and keep course enrollment distinct from profile status/start-date metadata. Parent/third-party payer attribution remains separate future work. Student changes need no destructive migration or data correction before Step 7. Browser visual/keyboard QA and production-size load testing remain manual verification tasks.

## Reproduce verification

`npm run check` runs lint, strict TypeScript, portable SQL/unit tests and a production build. `npm run db:test` exercises real local PostgreSQL with rollback. `npm run test:integration` creates real isolated local Auth/business fixtures and exercises API/rendered forms; fixtures are retained. Integration files run serially against one dev server to avoid cold compilation contention, while explicit race tests within suites still send concurrent requests. `npm run test:smoke` checks public/protected routes, and `npm run format:check` checks formatting.

Focused commands: `node --test tests/student-first.test.mjs` and `node --env-file=.env.local --test tests/integration/student-first.test.mjs`. See [verification results](verification.md) for actual counts, limitations and the earlier modules' regression record.
