# Step 8B — advanced scheduling

Implemented on 26 October 2026, following core attendance (8A). The existing lesson, enrollment, teacher employee, original student/contact, authorization and finance services remain authoritative. This increment adds non-teaching dates and one-off weekly exceptions, safe regeneration and clearer review of existing lesson changes. It introduces no dependency or environment variable.

## Local walkthrough

On this configured machine the app is at <http://127.0.0.1:3000>. If it has stopped, start Docker Desktop, then run:

```powershell
npm run db:start
npm run db:migrate
npm run dev
```

Use the existing `.env.local` with local Supabase on port 54321. Do not reset the database to apply this increment. No additional manual configuration is required here. Fresh-machine setup is in the root README.

1. Log in as an Owner/Admin, select your business and open **Non-teaching dates** at `/scheduling/closures`. Create a future business holiday or branch closure with a name, reason and inclusive dates.
2. Open its detail page. Review affected existing lessons and audit history. Existing scheduled/completed lessons and attendance remain intact. Review each affected future lesson explicitly; cancel it or use its reschedule page with a reason. A move into an active closure fails without changing the source. A successful move retains the linked original and replacement.
3. Open a group's **Weekly schedules**, then **Occurrence exceptions**. Select a weekly series and matching future local date; save a reason. It skips that one occurrence, without changing the weekly definition or an already generated lesson.
4. Generate a period of at most 31 dates. Review the saved receipt: created, existing, past, closure and exception counts, plus paginated skipped occurrences and source links. Repeating generation cannot duplicate an occurrence. Replaying the same request retains its original receipt even after a closure changes.
5. Retire a future closure or disable an exception. Restored weekly reservations are checked for group, teacher and classroom conflicts. If another booking now occupies the resource, restoration fails atomically. Resolve that conflict explicitly before retrying; do not expect cancelled/rescheduled originals to be regenerated.
6. Inspect day/week/month **Timetable** closure badges and retained lesson events. Open **Scheduling changes** at `/scheduling/changes` to review authorized moves, cancellations and edits with actor/time/reason.
7. With an invited Teacher, verify read access only in authorized teaching scope and no closure management. With a Branch Manager, verify own-branch closure management and denial for another branch or the whole business. Another business and an unauthenticated session must not expose these records.

The automated live suite submits actual rendered forms and inspects saved local records. Browser visual/mobile/keyboard behavior and native confirmation interactions still require manual review.

## Schema and migration contracts

Five additive, applied migrations, `20261026000800` through `20261026001200`, add four tables and extend generation batches. Generated TypeScript types come from the actual local schema.

| Table                       | Purpose                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_closures`         | Tenant-bound holiday/closure; nullable immutable branch scope, name/reason, inclusive dates, retained creation timezone, active state, version and actor/timestamps |
| `group_schedule_exceptions` | Unique tenant/weekly-series/date exception with fixed group/branch identity, reason, active state and version                                                       |
| `academic_calendar_events`  | Immutable actor/time/reason and before/after audit for closure and exception commands                                                                               |
| `lesson_generation_skips`   | Immutable batch/series/date skip with composite source references and a closure or exception foreign key                                                            |

`lesson_generation_batches` gains `closure_count` and `exception_count` defaulting to zero for previous receipts. No existing identity, posted transaction, enrollment, lesson clock or attendance record is rewritten. An independent populated-upgrade test compares complete existing record hashes, finalized attendance and exact financial profiles before/after migration and closure creation.

All new tables have RLS and explicit grants. Raw closure/exception reads are scope checked; client writes are revoked. Audit and skipped-occurrence data use checked read APIs. Writes use the existing actor/payload-bound request receipts, optimistic versions and tenant transaction lock. Composite foreign keys prevent mixed-tenant/group/branch references. Neither hidden form IDs nor route parents grant access; server actions and database commands independently authorize the actual records.

## Permissions

| Principal      | Calendar access                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Owner/Admin    | Business-wide `schedules.manage_holidays`; own-business management and authorized review                       |
| Branch Manager | `schedules.manage_holidays` in assigned branches; no whole-business management even when assigned every branch |
| Teacher        | Authorized calendar/teaching reads; no holiday/exception management by default                                 |
| Employee       | No scheduling management by default                                                                            |
| Custom role    | Explicit existing schedule/lesson permissions and the new scoped holiday permission                            |

Weekly exceptions use existing schedule management authorization for the actual group. Cancellation, edits and rescheduling retain existing `lessons.manage` checks. Holiday viewing requires scheduling read access in the relevant scope. The change feed applies lesson access on every row; it grants no student financial, salary, other-tenant or platform-administration access.

## Date, generation and conflict semantics

- A closure covers whole days in its retained business timezone: local starting midnight through midnight after the inclusive end date. Any lesson interval overlap is blocked, including an overnight lesson. Exact adjacency at the boundary is allowed. A closure can span at most 366 inclusive dates.
- New definitions start today or later. Future dates can be edited with a version check but cannot be backdated. Once a closure has started, its definition is retained; its active state can still change. Branch scope and timezone cannot be reassigned. There is no hard-delete UI/API.
- An exception uses the actual weekly series timezone/date, including retained revisions. It applies to one matching series/date only. Disabling it restores the normal plan; it does not erase history.
- Active closures block new, moved and resource-edited lesson bookings in the database. Weekly definitions may span closed dates; unmaterialized occurrences on those dates reserve no teaching resources.
- Existing concrete lessons remain resource reservations until explicitly cancelled or moved, even if a later closure/exception covers them. Creation never silently cancels, moves, marks absent, refunds or pays a teacher.
- Generation first respects existing occurrence roots, then past starts, then exceptions and closures. An exception takes precedence if both apply, so the occurrence is counted once. Skips are receipt records, not fabricated cancelled lessons or attendance.
- Retiring/shrinking a closure or disabling an exception validates the future weekly reservations it restores against concrete lessons and other weekly reservations. Conflicts roll back state, version and audit together. Tenant locking serializes booking, generation and calendar commands, including cross-branch teacher use.
- Upcoming lesson rescheduling keeps the old record and creates a linked replacement. Completed lesson clocks remain immutable; no historical clock-correction flow is added. Finalized attendance continues to prevent cancellation/rescheduling. Attendance is never copied to a replacement automatically.

The application retains existing half-open group, effective teacher and classroom conflict checks; there is no arbitrary conflict override. Impact review and query results are paginated. Generation is bounded to 31 dates. The main timetable has independently paginated closure badges (200 per page) and concrete events, rather than inventing events for ungenerated weekly plans.

## Verification and remaining scope

See [the current verification record](verification.md) for exact complete-run results. New portable, populated-upgrade, native PostgreSQL and real local form/API suites cover isolation, forged IDs, stale/idempotent commands, midnight/timezone boundaries, skip receipts, restoration conflicts, race safety, original lesson linkage and unchanged finalized attendance/finance.

**Scheduling changes** is a permission-scoped in-app feed. There is no notification delivery, unread inbox, email, SMS or push integration. No make-up workflow, actual-delivery extension, attendance rates/CSV/full Student Profile attendance summary, automatic billing or payroll is included. Those belong to subsequent 8C/8D increments. Production-size load, deployment and browser visual/accessibility QA remain unverified.
