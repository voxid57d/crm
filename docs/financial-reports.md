# Dashboard and financial reports (6E)

`/finance` supports Today, Monday-based This week, This month and a custom inclusive business-local date range, plus branch/all-authorized-scope selection. The workspace branch is the initial default. Explicitly select all scopes to include other permitted branches and authorized business-wide cashboxes.

Period metrics: gross payments received, refunds, net collections, currently issued invoice totals by issue date, net expense movements and signed cash movements. Current snapshots: outstanding/overdue receivables and all-time cashbox balances. Expense reversals affect net expenses in the correction period without rewriting earlier periods. Transfer legs cancel in business totals and never become collections/expenses. Business-wide cashboxes remain outside individual branch comparisons. These figures are not accounting profit. Metrics cover authorized source rows/cashboxes only; unavailable features display a dash/unavailable. Independent aggregation prevents shared customer branches from multiplying amounts.

Trends show the 60 most recent business dates with activity. Recent history shows ten cash movements. Current snapshots remain current when the period changes. UZS is the only enabled currency (two decimal places). PostgreSQL performs aggregation; money leaves SQL as exact text, never JavaScript Numbers.

| Report               | Semantics and relevant filters                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payment collection   | Effective date, method/customer/branch/cashbox/recorder/search; gross receipts and current lifetime allocated/refunded/credit                          |
| Outstanding debt     | Current positive issued balances, issue date, due/aging, branch/customer/creator/search                                                                |
| Overdue invoices     | Current positive overdue balances using business-local today; otherwise debt filters                                                                   |
| Expenses             | Original effective date, category/branch/cashbox/recorder/vendor/description; current reversed status retained                                         |
| Cashbox transactions | Effective date, signed legs, type/recorder/box/branch; customer/method for payments/refunds, category for expenses/reversals                           |
| Cashbox balances     | All-time current balances, including inactive boxes; branch/box/name filters. Dates/recorders do not alter balances                                    |
| Branch comparison    | Period collections/refunds/net expenses/cash movements; current outstanding debt                                                                       |
| Refunds              | Effective date, original customer/method, branch/box/recorder/reason                                                                                   |
| Customer statement   | Full current CRM customer access required; recorded-time invoice/allocation events and effective-time receipts/refunds; separate cash and debt columns |
| Financial audit      | Recorded-time events, branch/box/actor/kind; configuration events require business-wide report/audit access                                            |

Date bounds are local midnight through the midnight after the inclusive end date, converted to UTC using the tenant timezone. Statement allocations are not extra cash. A filtered statement is an event list, without opening/running balance calculation. Customer financial profiles supply current debt/credit snapshots. Expense report rows retain original gross amounts and current reversal status; correction movements appear separately in cashbox history.

`finance.dashboard.view` and `finance.reports.view` are separate capabilities. Every result also checks feature permissions and actual branch/box/invoice scope. Owner/Admin defaults grant business-wide access; Manager defaults grant assigned-branch access. Cashier/Teacher/Employee defaults grant neither dashboard nor reports. Audit additionally requires `finance.audit.view`. Custom roles use the existing permission engine. Private query functions are not API-callable; checked public functions use fixed search paths and current authenticated identity. Direct monetary SELECT/DML grants remain revoked. Multi-leg audit requires all associated cashboxes. Exports omit command payloads and private before/after details.

Pages paginate 20 rows. Customer/recorder choices show up to 200 authorized historical identities. Customer filters can also be supplied by the customer profile statement link; IDs always remain checked inputs. CSV uses the same checked row query in one SQL snapshot, with a 5,000-row cap. Oversized files fail instead of truncating. Responses are private/no-store, filenames are allowlisted, cells are quoted and formula-like text escaped. Valid negative decimals retain exact text. Spreadsheet auto-typing is outside CSV's control: import large decimal columns as text.

The implementation has not been load-tested against production-sized tenants. Large exports deliberately require narrower filters; future scale testing should measure permission checks, count queries and branch comparisons before deployment.

Shared typed row/column interfaces allow future XLSX/PDF export without duplicating authorization/calculations. No export/chart dependency was added. Excel/PDF reports, statutory accounting, FX, gateways, payroll and automatic LMS billing remain outside this phase. Invoice browser print remains available and requires manual visual QA.

Checks: `node --test tests/financial-reporting.test.mjs tests/csv.test.mjs tests/finance-period.test.mjs`, `npm run db:test`, and `node --env-file=.env.local --test tests/integration/financial-reporting.test.mjs`. Coverage includes reconciliation, all ten rendered reports, current versus historical periods, large exact values, export limits/formula protection, and foreign tenant/branch/employee/subjectless denial.
