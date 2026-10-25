# Step 7A — course catalog and classrooms

## Inspection and implementation plan

The existing schema contains tenants/branches and the permission engine, employees with branch assignments and confidential salary configuration, customers as authoritative contact identities, `student_profiles(tenant_id, customer_id)`, reusable guardians, lead conversion, and immutable financial source/ledger records. There are no course/classroom/group/enrollment/lesson tables. The permission catalog already includes `courses.view` and `courses.manage`; these will be reused rather than adding equivalent create/update/archive keys.

Step 6F is present: `/students/new` uses a single transactional `save_student`, promotion/retries preserve customer IDs, `/students/[customer]` is the unified profile, and education lead conversion calls `convert_lead_to_student`. Invoice, payment, credit and refund references remain customer-based. Teachers already use employee/role records; no teacher identity is needed in 7A. Existing tests exercise real local Auth, RLS, server forms and financial continuity. The initial Git tree was clean; installed Next.js data-security and Server Actions guides were read before coding.

This increment adds only tenant-wide course categories/levels/courses, branch-specific physical classrooms, checked mutations/read queries and retained configuration history. Course fees are exact-decimal templates, not financial postings. Duration has an explicit unit; default lesson length is minutes. No existing identity or financial data is rewritten. No groups, enrollments, teacher assignments, schedules, lessons or academic dashboard are implemented.

Catalog readers may use `courses.view` in their business or an assigned branch because the catalog is deliberately shared tenant-wide. Changing any catalog/category/level requires **business-wide** `courses.view` and `courses.manage`; branch grants cannot authorize a tenant-wide change. Classrooms require `classrooms.view`/`classrooms.manage` in their actual branch. These are added to the existing engine, not a second ACL. Course prices are business configuration visible to catalog readers; catalog/room grants never grant finance or salary access.

Additive migrations will define tenant-composite references, indexes, RLS, no client mutation grants, exact text price APIs, immutable scope/currency/creation identity, optimistic versions, idempotent requests and append-only before/after history. Classroom branches cannot be moved; deactivate and retain references instead. Inactive category/level references remain readable and cannot be newly assigned. New/reactivated rooms need active branches. Records are deactivated, never permanently deleted by the app.

UI: `/courses` with directory/create/profile/edit and categories/levels settings; `/classrooms` with branch directory/create/profile/edit. Existing module bookmarks redirect to the implemented catalog. Student-first navigation remains primary. Future groups/enrollment counts and classroom schedules are identified as unavailable until their own increments, with no invented zero counts or availability.

Validation covers exact amounts (including free courses), same-tenant references, scope restrictions, stale edits, retries and deactivation. Tests will cover owner/admin/manager/teacher/ordinary/foreign/unauthenticated access, forged branch IDs, exact prices beyond JavaScript safe integers, retained history and a populated pre-7A upgrade preserving student/guardian/lead/financial records. Existing suites and builds will be rerun locally. No dependencies or hosted deployment are needed.

## Implemented database contract

Three additive migrations, `20261025000100` through `20261025000300`, add the schema, checked commands and read APIs. They are applied to the retained local database. Generated database types include the actual schema; the existing nullable-UUID refinement covers create/update commands. No original student, employee, sales or financial table/function is replaced.

| Table                                | Purpose and scope                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `courses`                            | Shared tenant catalog, optional code/category/level, explicit duration/unit, lesson minutes, exact nonnegative price, pricing model, UZS, active flag and version |
| `course_categories`, `course_levels` | Customizable tenant lists with case-insensitively unique names, active flags and versions                                                                         |
| `classrooms`                         | Physical branch resources with fixed branch, description, bounded capacity, active flag and version                                                               |
| `academic_configuration_events`      | Immutable actor/time/reason and before/after history, plus private request receipts for safe retries                                                              |

Composite foreign keys enforce same-tenant category, level and branch references. Course codes are case-insensitively unique when present. Classroom names are unique within their branch, including inactive rooms. Names/codes can be reused in a different tenant; room names can be reused at another branch. Deactivation retains identifiers, references and audit history; app users cannot delete resources. Course currency, resource tenant/creation identity and classroom branch cannot change.

Prices follow the existing financial decimal convention: up to 16 whole digits and two decimal places, stored as PostgreSQL NUMERIC and returned through checked JSON APIs as strings. JSON numeric price input and excess precision are rejected instead of silently rounded. `0.00` supports free courses. Duration is optional, with days/weeks/months/lessons explicitly recorded; lesson duration is optional minutes (1–1,440). Classroom capacity is 1–10,000. Fixed course, monthly and per-lesson pricing are templates only. Catalog edits never create or change financial transactions.

Writes use `save_course`, `save_course_setting`, `save_classroom` and `set_academic_active`. Commands authorize actual resources, serialize requests within the tenant, record a unique request receipt atomically and reject stale versions. Matching retries return the original ID; reuse with different details or actor fails. Course metadata editing cannot implicitly change archive status. Status changes use dedicated checked commands. Inactive category/level references can be retained or removed on existing courses; new references require active settings. Creating/reactivating rooms requires an active branch, while authorized users can inspect retained rooms in inactive branches.

Read APIs are `course_catalog_options`, `course_directory`, `course_details`, `classroom_directory`, `classroom_details` and `academic_configuration_history`. Direct metadata reads have RLS; raw price and command/audit payload reads have no client grants. Direct client writes are revoked. Lists and history are paged in batches of 20; price sorting happens as SQL NUMERIC. Category/level setting forms have search and pagination. Catalog dropdowns intentionally return all tenant settings. Large-catalog indexing/load testing remains future work.

## Permissions

| Role           | Catalog                                                      | Classrooms                            | Finance/salary                   |
| -------------- | ------------------------------------------------------------ | ------------------------------------- | -------------------------------- |
| Owner / Admin  | View and manage tenant-wide                                  | View/manage across business branches  | Existing independent grants only |
| Branch Manager | View shared catalog; cannot change tenant-wide configuration | View/manage assigned branches         | No grants added                  |
| Teacher        | View shared catalog and price templates                      | View assigned branches; no management | No grants added                  |
| Employee       | No academic access by default                                | No access by default                  | No grants added                  |
| Custom role    | Explicit existing permission grants                          | Actual branch or business scope       | Existing independent grants only |

An assigned branch `courses.view` grant permits reading the shared tenant catalog. Management requires both global `courses.view` and global `courses.manage`, even if every branch separately grants management. Room reads/writes require view and the relevant operation in the resource's **actual** branch. Neither cookie preferences nor supplied IDs grant access. Read-only users cannot read change history. Tenant users receive no platform administration access.

## Manual testing

No new package, account service or environment variable is required on this configured machine. For a later restart, start Docker Desktop, run `npm run db:start`, `npm run db:migrate` and `npm run dev`. Preserve `.env.local`; use local Supabase only. Never reset the database to apply these migrations. Open <http://127.0.0.1:3000> and log in with your existing account, then select your education business.

1. Open **Courses → Categories & levels**. Create a category such as Languages, switch Configure to Levels, apply the filter, and create A1. Create your own records; the app seeds no sample courses or rooms.
2. Select **Add course**. Enter General English A1, a unique optional code, category/level, 12 weeks, 90 lesson minutes, `750000.10`, and Monthly tuition. Save and confirm its detail page. Edit the price and inspect Configuration history. A free `0.00` price is allowed; `1.001` and negative amounts are rejected.
3. Search/filter/sort the course directory. Archive the course with confirmation, find it using Archived status and reactivate it. Deactivate a category/level in settings and confirm existing references remain visible while the inactive value cannot be assigned to another course.
4. Open **Classrooms → Add classroom**. Choose an active branch, enter Room 101 and capacity 12. Save, edit capacity, deactivate and reactivate. Filter by another branch; choose All authorized branches to inspect the full permitted list. There is no schedule or occupancy calculation yet.
5. With separately registered local accounts, use existing Owner team/role tools to assign a Branch Manager and Teacher to just one branch. In separate browser profiles, confirm the Manager manages rooms only there and the Teacher reads courses/rooms without edit controls or salary/financial access. A second business must not see the first business's records, including when a URL ID is changed. Default Employee has no academic access.
6. Open an existing Student Profile with guardians and financial history. Confirm original links, identifiers, invoices and credit/debt remain accessible according to existing permissions. Course price changes must not change those balances. An older course edit tab should reject a stale save after another tab changes the course.

Reproducible automated checks: `npm run check`, `npm run db:test`, `npm run db:lint`, then with the app running `npm run test:integration` and `npm run test:smoke`. The live suites create isolated real local test accounts/business records and retain them for inspection. Native pgTAP fixtures roll back. Portable tests use isolated embedded PostgreSQL to execute real migration SQL, including a populated upgrade from the pre-7A schema. See [verification](verification.md) for the completed run and limitations.

## Next increments and integration boundaries

Only 7A is implemented. Course-associated groups and enrollment counts require 7B; their UI identifies the future increment without displaying fabricated counts. Classroom schedules and availability/conflict calculations require 7C. Online groups/lessons will use a nullable classroom reference, not a fake physical room. Existing Students remains the only student directory; later enrollments must reference `student_profiles(tenant_id, customer_id)`. Later teaching assignments must reference existing employees and authorize branch assignments.

Enrollment agreements in 7B must snapshot their own price/model/currency; changing a course template must not update agreements or posted invoices. The enrollment-to-draft-invoice action and academic dashboard belong to 7D and must call existing financial services under independent finance permissions. No invoice is created by 7A.

The current student receiving education, independent guardian contact, invoice customer/debtor and payment provider may be different people. Existing finance links remain on shared customer identities. Guardians do not automatically become debtors or payers, and no guardian-to-customer conversion or structured third-party payer attribution was added. Guardian-as-debtor support needs a separately reviewed extension; do not duplicate students or rewrite invoice customer IDs as a workaround.

Remaining manual QA includes responsive visual layout, keyboard/focus and browser-native confirmation interactions. Actual lesson scheduling, enrollments, calendars, academic aggregation, attendance, recurring billing, payroll, cloud deployment and production-size performance are outside 7A. Await the next instruction before starting 7B.
