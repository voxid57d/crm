import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("invoice lifecycle, exact receivables, audit and branch isolation", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const uid = (n) => `83000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 6; n++)
    await rows(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [uid(n), `invoice${n}@example.test`, { full_name: `Invoice Actor ${n}` }],
    );
  await as(1);
  const tenant = (
    await rows("select public.create_business('Invoice A') id")
  )[0].id;
  const branch = (await rows("select id from public.branches"))[0].id;
  const otherBranch = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Other billing branch') returning id",
      [tenant],
    )
  )[0].id;
  const customer = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Student", phone: "998901234" },
      [branch],
    ])
  )[0].id;
  const shared = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Shared customer", phone: "998902345" },
      [branch, otherBranch],
    ])
  )[0].id;
  const otherCustomer = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Other branch student", phone: "998903456" },
      [otherBranch],
    ])
  )[0].id;
  const today = (
    await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
  )[0].d;
  await as(2);
  const foreign = (
    await rows("select public.create_business('Invoice B') id")
  )[0].id;
  const foreignBranch = (await rows("select id from public.branches"))[0].id;
  const foreignCustomer = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      foreign,
      { first_name: "Foreign", phone: "998904567" },
      [foreignBranch],
    ])
  )[0].id;
  await as(1);
  const items = [
    {
      description: "Tuition",
      quantity: "1.5",
      unit_price: "100.10",
      discount_amount: "0.15",
    },
  ];
  const draft = async (
    extra = {},
    lines = items,
    id = null,
    version = 0,
    key = randomUUID(),
  ) =>
    (
      await rows("select public.save_invoice_draft($1,$2,$3,$4,$5,$6) id", [
        tenant,
        id,
        key,
        version,
        {
          branch_id: branch,
          customer_id: customer,
          currency: "UZS",
          issue_date: today,
          due_date: today,
          discount_amount: "10.00",
          ...extra,
        },
        lines,
      ])
    )[0].id;
  const detail = async (id) =>
    (await rows("select public.invoice_details($1,$2) value", [tenant, id]))[0]
      .value;
  const move = async (
    id,
    action = "issue",
    version = 1,
    key = randomUUID(),
    reason = "Verified correction",
  ) =>
    (
      await rows("select public.transition_invoice($1,$2,$3,$4,$5,$6) id", [
        tenant,
        id,
        key,
        version,
        action,
        reason,
      ])
    )[0].id;
  const debt = async (filter = {}) =>
    (
      await rows("select public.debt_directory($1,$2) value", [tenant, filter])
    )[0].value;
  let invoice, voided, sharedA, sharedB;
  await t.test(
    "draft creation, retry and exact per-line rounding do not post cash or receivables",
    async () => {
      const key = randomUUID();
      invoice = await draft({}, items, null, 0, key);
      assert.equal(await draft({}, items, null, 0, key), invoice);
      await assert.rejects(
        draft({ notes: "Changed payload" }, items, null, 0, key),
        /request identifier/,
      );
      const d = await detail(invoice);
      assert.equal(d.subtotal, "150.00");
      assert.equal(d.total, "140.00");
      assert.equal(d.outstanding, "0.00");
      assert.equal(d.invoice.items[0].quantity, "1.5000");
      assert.equal(d.invoice.invoice_number, null);
      assert.equal((await debt()).summary.outstanding, "0.00");
      assert.equal(d.receivables.length, 0);
      await db.exec("reset role");
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.financial_ledger_entries",
          )
        )[0].n,
        0,
      );
      await as(1);
    },
  );
  await t.test(
    "draft edits retain audit snapshots and reject stale versions",
    async () => {
      await draft({ notes: "Checked draft" }, items, invoice, 1);
      await assert.rejects(draft({}, items, invoice, 1), /changed/);
      const d = await detail(invoice);
      assert.equal(d.invoice.version, 2);
      assert.equal(d.invoice.notes, "Checked draft");
      assert.equal(d.history.length, 2);
      assert.equal(d.history[0].after_data.items[0].unit_price, "100.10");
    },
  );
  await t.test(
    "zero quantity, negative/overlarge amounts, numeric JSON, excess precision and invalid discounts/dates are rejected",
    async () => {
      for (const bad of [
        { quantity: "0" },
        { quantity: "-1" },
        { quantity: "1.00001" },
        { quantity: "1000000" },
        { unit_price: "-1" },
        { unit_price: "1.001" },
        { unit_price: 1 },
        { discount_amount: "999.00" },
      ])
        await assert.rejects(
          draft({}, [{ ...items[0], ...bad }]),
          /decimal|positive|Money|discount/,
        );
      await assert.rejects(draft({ discount_amount: "151" }), /discount/);
      await assert.rejects(draft({ due_date: "2000-01-01" }), /dates/);
      await assert.rejects(draft({}, []), /between 1 and 100/);
      await assert.rejects(
        draft({}, [
          { ...items[0], quantity: "2", unit_price: "9999999999999999.99" },
        ]),
        /line total/,
      );
      const free = await draft({ discount_amount: "0" }, [
        {
          description: "Free item",
          quantity: "1",
          unit_price: "0",
          discount_amount: "0",
        },
      ]);
      await assert.rejects(move(free), /positive total/);
    },
  );
  await t.test(
    "customer and branch relationships cannot be forged, including cross-tenant IDs",
    async () => {
      for (const extra of [
        { customer_id: foreignCustomer },
        { branch_id: foreignBranch },
        { customer_id: otherCustomer },
        { currency: "USD" },
      ])
        await assert.rejects(draft(extra), /denied|authorized|currency/);
      await rows("select public.archive_customer($1,$2,true)", [
        tenant,
        otherCustomer,
      ]);
      await assert.rejects(
        draft({ branch_id: otherBranch, customer_id: otherCustomer }),
        /active authorized/,
      );
      await rows("select public.archive_customer($1,$2,false)", [
        tenant,
        otherCustomer,
      ]);
    },
  );
  await t.test(
    "issuance atomically numbers the document, freezes content and creates its exact receivable",
    async () => {
      const key = randomUUID();
      await move(invoice, "issue", 2, key);
      assert.equal(await move(invoice, "issue", 2, key), invoice);
      const d = await detail(invoice);
      assert.equal(d.invoice.invoice_number, "INV-000001");
      assert.equal(d.status, "issued");
      assert.equal(d.outstanding, "140.00");
      assert.equal(d.receivables.length, 1);
      assert.equal(d.history[0].operation, "invoice_issued");
      await assert.rejects(draft({}, items, invoice, 3), /Only drafts/);
      await assert.rejects(move(invoice, "issue", 3), /Only draft/);
      assert.equal((await debt()).summary.outstanding, "140.00");
    },
  );
  await t.test(
    "issued snapshots survive customer edits and archive, and voiding retains and offsets the original",
    async () => {
      await rows("select public.save_customer($1,$2,$3,$4)", [
        tenant,
        customer,
        { first_name: "Renamed contact", phone: "998901234" },
        [branch],
      ]);
      assert.equal((await detail(invoice)).invoice.bill_to.name, "Student");
      await rows("select public.archive_customer($1,$2,true)", [
        tenant,
        customer,
      ]);
      const key = randomUUID();
      await move(invoice, "void", 3, key, "Incorrect service");
      assert.equal(
        await move(invoice, "void", 3, key, "Incorrect service"),
        invoice,
      );
      const d = await detail(invoice);
      assert.equal(d.status, "voided");
      assert.equal(d.total, "140.00");
      assert.equal(d.outstanding, "0.00");
      assert.equal(d.receivables.length, 2);
      assert.equal(d.receivables[1].amount, "-140.00");
      assert.equal((await debt()).summary.issued_charges, "140.00");
      assert.equal((await debt()).summary.voided_charges, "140.00");
      assert.equal((await debt()).summary.outstanding, "0.00");
      await rows("select public.archive_customer($1,$2,false)", [
        tenant,
        customer,
      ]);
      voided = invoice;
    },
  );
  await t.test(
    "controlled replacement links a voided original and retains draft discard history",
    async () => {
      const replacement = await draft({ replaces_invoice_id: voided });
      assert.equal(
        (await detail(replacement)).invoice.replaces_invoice_id,
        voided,
      );
      assert.equal((await detail(voided)).replacements[0].id, replacement);
      await move(replacement, "discard", 1);
      assert.equal((await detail(replacement)).status, "discarded");
      assert.equal((await detail(replacement)).outstanding, "0.00");
      await assert.rejects(draft({}, items, replacement, 2), /Only drafts/);
      await assert.rejects(
        draft({
          branch_id: otherBranch,
          customer_id: otherCustomer,
          replaces_invoice_id: voided,
        }),
        /Replacement/,
      );
    },
  );
  await t.test(
    "large invoice sums retain exact text and issuing does not mutate cash ledger",
    async () => {
      const large = await draft({ discount_amount: "0" }, [
        {
          description: "Exact large bill",
          quantity: "1",
          unit_price: "9999999999999999.99",
          discount_amount: "0",
        },
      ]);
      await move(large);
      assert.equal((await detail(large)).total, "9999999999999999.99");
      assert.equal((await detail(large)).outstanding, "9999999999999999.99");
      await move(large, "void", 2);
      await db.exec("reset role");
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.financial_ledger_entries",
          )
        )[0].n,
        0,
      );
      await as(1);
    },
  );
  await t.test(
    "archived customers, inactive branches and future issue dates block issuance",
    async () => {
      const target = await draft();
      await rows("select public.archive_customer($1,$2,true)", [
        tenant,
        customer,
      ]);
      await assert.rejects(move(target), /active authorized/);
      await rows("select public.archive_customer($1,$2,false)", [
        tenant,
        customer,
      ]);
      await rows("update public.branches set is_active=false where id=$1", [
        branch,
      ]);
      await assert.rejects(move(target), /inactive branch/);
      await rows("update public.branches set is_active=true where id=$1", [
        branch,
      ]);
      const future = (await rows("select ($1::date+1)::text d", [today]))[0].d;
      const scheduled = await draft({ issue_date: future, due_date: future });
      await assert.rejects(move(scheduled), /future/);
    },
  );
  await t.test(
    "failed issuance rolls back status, receivable, audit and invoice counter together",
    async () => {
      const target = await draft();
      await db.exec(
        "reset role;create function public.invoice_failure() returns trigger language plpgsql as $$begin if new.operation='invoice_issued' then raise exception 'Injected invoice failure';end if;return new;end$$;create trigger invoice_failure before insert on public.financial_audit_events for each row execute function public.invoice_failure();",
      );
      const counter = (
        await rows(
          "select last_number::text n from public.invoice_number_counters where tenant_id=$1",
          [tenant],
        )
      )[0].n;
      await as(1);
      const key = randomUUID();
      await assert.rejects(move(target, "issue", 1, key), /Injected/);
      assert.equal((await detail(target)).invoice.state, "draft");
      assert.equal((await detail(target)).receivables.length, 0);
      await db.exec(
        "reset role;drop trigger invoice_failure on public.financial_audit_events;drop function public.invoice_failure();",
      );
      assert.equal(
        (
          await rows(
            "select last_number::text n from public.invoice_number_counters where tenant_id=$1",
            [tenant],
          )
        )[0].n,
        counter,
      );
      await as(1);
      await move(target, "issue", 1, key);
      await move(target, "void", 2);
    },
  );
  await t.test(
    "multi-branch customers own separate invoice branches without multiplying debt; aging uses tenant dates",
    async () => {
      sharedA = await draft({ customer_id: shared, discount_amount: "0" });
      sharedB = await draft({
        branch_id: otherBranch,
        customer_id: shared,
        discount_amount: "0",
      });
      await move(sharedA);
      await move(sharedB);
      for (const days of [1, 7, 8, 30, 31, 60, 61]) {
        const d = (
          await rows("select ($1::date-$2::integer)::text d", [today, days])
        )[0].d;
        const id = await draft(
          {
            customer_id: shared,
            issue_date: d,
            due_date: d,
            discount_amount: "0",
          },
          [
            {
              description: "Aging fixture",
              quantity: "1",
              unit_price: "10",
              discount_amount: "0",
            },
          ],
        );
        await move(id);
      }
      const d = await debt({ customer: shared });
      assert.equal(d.rows.length, 1);
      assert.equal(d.summary.outstanding, "370.00");
      assert.equal(d.summary.not_due, "300.00");
      assert.equal(d.summary.days_1_7, "20.00");
      assert.equal(d.summary.days_8_30, "20.00");
      assert.equal(d.summary.days_31_60, "20.00");
      assert.equal(d.summary.days_over_60, "10.00");
      assert.equal(
        (await debt({ customer: shared, branch: otherBranch })).summary
          .outstanding,
        "150.00",
      );
      const profile = (
        await rows("select public.customer_financial_profile($1,$2) value", [
          tenant,
          shared,
        ])
      )[0].value;
      assert.equal(profile.summary.outstanding, "370.00");
      assert.equal(profile.summary.outstanding_invoices, 9);
    },
  );
  await t.test(
    "managers operate assigned invoice branches, cashiers view, employees and foreign identities cannot escalate",
    async () => {
      await db.exec("reset role");
      for (const [n, role] of [
        [3, "manager"],
        [4, "cashier"],
        [5, "employee"],
        [6, "teacher"],
      ]) {
        await rows(
          "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key=$3",
          [tenant, uid(n), role],
        );
        await rows(
          "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
          [tenant, branch, uid(n)],
        );
      }
      await as(3);
      const managed = await draft();
      await move(managed);
      await assert.rejects(move(managed, "void", 2), /denied/);
      await assert.rejects(detail(sharedB), /denied/);
      await assert.rejects(
        draft({ customer_id: shared }),
        /authorized customer/,
      );
      await as(4);
      assert.equal((await detail(sharedA)).total, "150.00");
      assert.equal((await detail(sharedA)).history[0].before_data, null);
      await assert.rejects(draft(), /denied/);
      await assert.rejects(move(sharedA, "void", 2), /denied/);
      await assert.rejects(detail(sharedB), /denied/);
      assert.equal((await debt()).summary.outstanding, "360.00");
      await assert.rejects(debt({ branch: otherBranch }), /denied/);
      for (const n of [5, 6, 2, 0]) {
        await as(n);
        await assert.rejects(detail(sharedA), /denied/);
        await assert.rejects(draft(), /denied/);
        await assert.rejects(move(sharedA, "void", 2), /denied/);
      }
      await as(1);
    },
  );
  await t.test(
    "employee deactivation revokes invoice and debt access without destroying attribution",
    async () => {
      await db.exec("reset role");
      await rows(
        "insert into public.employees(tenant_id,user_id,full_name,status,start_date) values($1,$2,'Cashier','inactive',$3)",
        [tenant, uid(4), today],
      );
      await as(4);
      await assert.rejects(detail(sharedA), /denied/);
      await assert.rejects(debt(), /denied/);
      await as(1);
      assert.ok((await detail(sharedA)).history[0].actor_name);
    },
  );
  await t.test(
    "issued documents, receivable history and audit resist direct mutations; deferred checks protect draft/issue integrity",
    async () => {
      await db.exec("reset role");
      await assert.rejects(
        rows("update public.invoices set notes=$1 where id=$2", [
          "Tamper",
          sharedA,
        ]),
        /immutable/,
      );
      await assert.rejects(
        rows(
          "update public.invoice_items set unit_price=1 where invoice_id=$1",
          [sharedA],
        ),
        /Only draft/,
      );
      await assert.rejects(
        rows(
          "delete from public.invoice_receivable_entries where invoice_id=$1",
          [sharedA],
        ),
        /immutable/,
      );
      await assert.rejects(
        rows("delete from public.invoices where id=$1", [sharedA]),
        /retained/,
      );
      const untouched = await draft(); // privileged fixture still has authenticated subject
      await assert.rejects(
        rows("delete from public.invoice_items where invoice_id=$1", [
          untouched,
        ]),
        /item count/,
      );
      await assert.rejects(
        rows(
          "update public.invoices set state='issued',invoice_number='FAKE',issued_at=now(),issued_by=$1 where id=$2",
          [uid(1), untouched],
        ),
        /exact receivable/,
      );
      await as(1);
      for (const table of [
        "invoices",
        "invoice_items",
        "invoice_receivable_entries",
        "invoice_number_counters",
      ])
        await assert.rejects(
          rows(`select * from public.${table}`),
          /permission denied/,
        );
    },
  );
  await t.test(
    "invoice directory supports real literal search, status, sorting and bounded pagination",
    async () => {
      for (let n = 0; n < 21; n++)
        await draft({ notes: `Page ${n}`, discount_amount: "0" }, [
          {
            description: "Paging item",
            quantity: "1",
            unit_price: "1",
            discount_amount: "0",
          },
        ]);
      const r = (
        await rows("select public.invoice_directory($1,$2,1) value", [
          tenant,
          { status: "draft", q: "Renamed contact", sort: "total" },
        ])
      )[0].value;
      assert.ok(r.total >= 21);
      assert.equal(r.rows.length, Math.min(20, r.total - 20));
      assert.ok(
        r.rows.every((r) => typeof r.total === "string" && r.state === "draft"),
      );
    },
  );
});
