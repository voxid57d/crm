import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("payments, credit, allocations and immutable receivables", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const uid = (n) => `85000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 4; n++)
    await rows("insert into auth.users(id,email) values($1,$2)", [
      uid(n),
      `payment${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
    await rows("select public.create_business('Payments A') id")
  )[0].id;
  const branch = (await rows("select id from public.branches"))[0].id;
  const second = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Second payments branch') returning id",
      [tenant],
    )
  )[0].id;
  const customer = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Paying customer", phone: "998901234" },
      [branch, second],
    ])
  )[0].id;
  const another = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Another customer", phone: "998902345" },
      [branch],
    ])
  )[0].id;
  const today = (
    await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
  )[0].d;
  const box = async (b = branch) =>
    (
      await rows("select public.save_cashbox($1,null,$2,$3) id", [
        tenant,
        randomUUID(),
        { branch_id: b, name: "Payment cashbox", cashbox_type: "cash" },
      ])
    )[0].id;
  const cashbox = await box(),
    otherBox = await box(second);
  const invoice = async (amount = "100", cust = customer, b = branch) => {
    const id = (
      await rows("select public.save_invoice_draft($1,null,$2,0,$3,$4) id", [
        tenant,
        randomUUID(),
        {
          branch_id: b,
          customer_id: cust,
          issue_date: today,
          due_date: today,
          discount_amount: "0",
        },
        [
          {
            description: "Tuition",
            quantity: "1",
            unit_price: amount,
            discount_amount: "0",
          },
        ],
      ])
    )[0].id;
    await rows("select public.transition_invoice($1,$2,$3,1,'issue')", [
      tenant,
      id,
      randomUUID(),
    ]);
    return id;
  };
  const a = await invoice(),
    b = await invoice("100"),
    otherInvoice = await invoice("100", customer, second),
    wrongCustomer = await invoice("100", another);
  const payment = async (amount, alloc = [], extra = {}, key = randomUUID()) =>
    (
      await rows("select public.post_payment($1,$2,$3,$4) id", [
        tenant,
        key,
        {
          branch_id: branch,
          customer_id: customer,
          cashbox_id: cashbox,
          amount,
          method: "cash",
          paid_at: `${today}T00:00:00+05:00`,
          ...extra,
        },
        alloc,
      ])
    )[0].id;
  const detail = async (p) =>
    (await rows("select public.payment_details($1,$2) value", [tenant, p]))[0]
      .value;
  const balance = async () =>
    (
      await rows("select public.cashbox_details($1,$2) value", [
        tenant,
        cashbox,
      ])
    )[0].value.balance;
  const inv = async (id) =>
    (await rows("select public.invoice_details($1,$2) value", [tenant, id]))[0]
      .value;
  const alloc = async (p, i, n, original = null, key = randomUUID()) =>
    (
      await rows("select public.allocate_payment($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        p,
        i,
        key,
        n,
        original ? "Correct allocation" : "",
        original,
      ])
    )[0].id;
  let p, first;
  await t.test(
    "partial payment posts cash once and reduces only its allocated invoice",
    async () => {
      p = await payment("60", [{ invoice_id: a, amount: "40" }]);
      assert.equal(await balance(), "60.00");
      assert.equal((await inv(a)).outstanding, "60.00");
      assert.equal((await inv(a)).status, "partially_paid");
      assert.equal((await detail(p)).payment.credit, "20.00");
      first = (await detail(p)).allocations[0].id;
    },
  );
  await t.test(
    "allocate existing credit across invoices without another cash posting",
    async () => {
      await alloc(p, b, "20");
      assert.equal(await balance(), "60.00");
      assert.equal((await inv(b)).outstanding, "80.00");
      assert.equal((await detail(p)).payment.credit, "0.00");
      await assert.rejects(alloc(p, a, "0.01"), /exceeds/);
    },
  );
  await t.test(
    "multiple payments settle an invoice; full settlement is derived",
    async () => {
      await payment("60", [{ invoice_id: a, amount: "60" }]);
      assert.equal((await inv(a)).outstanding, "0.00");
      assert.equal((await inv(a)).status, "paid");
      await assert.rejects(
        payment("1", [{ invoice_id: a, amount: "1" }]),
        /exceeds/,
      );
      assert.equal(await balance(), "120.00");
    },
  );
  await t.test(
    "unallocated receipts are real customer credit; allocation releases reopen debt",
    async () => {
      const unallocated = await payment("25.20");
      assert.equal((await detail(unallocated)).payment.credit, "25.20");
      await alloc(p, a, "10", first);
      assert.equal((await inv(a)).outstanding, "10.00");
      assert.equal((await detail(p)).payment.credit, "10.00");
      assert.equal(await balance(), "145.20");
      await assert.rejects(alloc(p, a, "31", first), /exceeds/);
    },
  );
  await t.test(
    "request retries are exact and rollback failed multi-invoice posting",
    async () => {
      const key = randomUUID(),
        r = await payment("5", [], {}, key);
      assert.equal(await payment("5.00", [], {}, key), r);
      await assert.rejects(payment("6", [], {}, key), /identifier/);
      const before = await balance();
      await assert.rejects(
        payment("20", [
          { invoice_id: b, amount: "10" },
          { invoice_id: wrongCustomer, amount: "10" },
        ]),
        /same customer/,
      );
      assert.equal(await balance(), before);
    },
  );
  await t.test(
    "zero, negative, numeric JSON, excess precision, invalid dates and cross-branch cashboxes are rejected",
    async () => {
      for (const amount of ["0", "-1", "0.001", "1e3", 1])
        await assert.rejects(payment(amount), /Amount|Invalid|decimal/);
      await assert.rejects(
        payment("1", [], { cashbox_id: otherBox }),
        /payment branch/,
      );
      await assert.rejects(
        payment("1", [], { paid_at: "2999-01-01T00:00:00Z" }),
        /future/,
      );
      await assert.rejects(
        payment("1", [], { paid_at: today + "T00:00:00" }),
        /timezone/,
      );
    },
  );
  await t.test(
    "void cannot offset an allocated invoice until its allocations are released",
    async () => {
      await assert.rejects(
        rows(
          "select public.transition_invoice($1,$2,$3,2,'void','Correction')",
          [tenant, b, randomUUID()],
        ),
        /release allocations/,
      );
      const allocation = (await detail(p)).allocations.find(
        (r) => r.invoice_id === b && r.amount === "20.00",
      );
      await alloc(p, b, "20", allocation.id);
      await rows(
        "select public.transition_invoice($1,$2,$3,2,'void','Correction')",
        [tenant, b, randomUUID()],
      );
      assert.equal((await inv(b)).outstanding, "0.00");
    },
  );
  await t.test(
    "cashiers can receive shared-customer branch payments without full CRM access, but cannot cross branches",
    async () => {
      await db.exec("reset role");
      for (const [n, role] of [
        [3, "cashier"],
        [4, "employee"],
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
      assert.equal(
        (
          await rows("select id from public.payment_customer_choices($1,$2)", [
            tenant,
            branch,
          ])
        ).length,
        2,
      );
      const receipt = await payment("10");
      await assert.rejects(alloc(receipt, otherInvoice, "1"), /denied/);
      assert.equal(typeof (await detail(p)).payment.credit, "string");
      await as(4);
      await assert.rejects(payment("1"), /denied/);
      await assert.rejects(detail(p), /denied/);
      await as(2);
      await assert.rejects(detail(p), /denied/);
      await as(0);
      await assert.rejects(payment("1"), /denied/);
      await as(1);
    },
  );
  await t.test(
    "posted source, allocation, cash and receivable records are immutable",
    async () => {
      for (const table of ["payments", "payment_allocations"])
        await assert.rejects(
          rows(`delete from public.${table}`),
          /permission denied/,
        );
      await db.exec("reset role");
      await assert.rejects(
        rows("delete from public.payments where id=$1", [p]),
        /immutable/,
      );
      await assert.rejects(
        rows("update public.payment_allocations set amount=1 where id=$1", [
          first,
        ]),
        /immutable/,
      );
      await as(1);
    },
  );
  await t.test(
    "customer credit/profile and paged queries use authorized real amounts",
    async () => {
      const profile = (
        await rows("select public.customer_financial_profile($1,$2) value", [
          tenant,
          customer,
        ])
      )[0].value;
      assert.ok(profile.can_view_payments);
      assert.equal(typeof profile.payment_summary.credit, "string");
      assert.ok(profile.payments.total >= 4);
      assert.ok(
        (
          await rows("select public.payment_directory($1,$2) value", [
            tenant,
            { method: "cash" },
          ])
        )[0].value.rows.every((p) => typeof p.amount === "string"),
      );
    },
  );
});
