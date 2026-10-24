import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
test("financial reports reconcile exact cash and debt without tenant or branch leakage", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const uid = (n) => `87000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const as = async (n) => {
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 4; n++)
    await rows("insert into auth.users(id,email) values($1,$2)", [
      uid(n),
      `report${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
      await rows("select public.create_business('Reporting A') id")
    )[0].id,
    branch = (await rows("select id from public.branches"))[0].id;
  const second = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Comparison branch') returning id",
      [tenant],
    )
  )[0].id;
  const customer = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Statement customer", phone: "998900111" },
      [branch],
    ])
  )[0].id;
  const box = async (b) =>
    (
      await rows("select public.save_cashbox($1,null,$2,$3) id", [
        tenant,
        randomUUID(),
        {
          branch_id: b,
          name: b === branch ? "Main drawer" : "Comparison drawer",
          cashbox_type: "cash",
        },
      ])
    )[0].id;
  const cashbox = await box(branch),
    otherBox = await box(second);
  await rows(
    "select public.post_cashbox_entry($1,$2,$3,'opening_balance','1000','Real reserve')",
    [tenant, cashbox, randomUUID()],
  );
  const dates = (
      await rows(
        "select (now() at time zone 'Asia/Tashkent')::date::text today,((now() at time zone 'Asia/Tashkent')::date-2)::text past",
      )
    )[0],
    at = dates.past + "T12:00:00+05:00";
  const invoice = (
    await rows("select public.save_invoice_draft($1,null,$2,0,$3,$4) id", [
      tenant,
      randomUUID(),
      {
        branch_id: branch,
        customer_id: customer,
        issue_date: dates.past,
        due_date: dates.past,
        discount_amount: "0",
      },
      [
        {
          description: "Tuition",
          quantity: "1",
          unit_price: "100",
          discount_amount: "0",
        },
      ],
    ])
  )[0].id;
  await rows("select public.transition_invoice($1,$2,$3,1,'issue')", [
    tenant,
    invoice,
    randomUUID(),
  ]);
  const payment = (
    await rows("select public.post_payment($1,$2,$3,$4) id", [
      tenant,
      randomUUID(),
      {
        branch_id: branch,
        customer_id: customer,
        cashbox_id: cashbox,
        amount: "60",
        method: "cash",
        paid_at: at,
      },
      [{ invoice_id: invoice, amount: "40" }],
    ])
  )[0].id;
  await rows("select public.post_payment_refund($1,$2,$3,$4,$5,$6,$7)", [
    tenant,
    payment,
    randomUUID(),
    cashbox,
    "10",
    at,
    "Partial credit refund",
  ]);
  const category = (
    await rows("select public.expense_category_directory($1) v", [tenant])
  )[0].v[0].id;
  const expense = (
    await rows("select public.post_expense($1,$2,$3) id", [
      tenant,
      randomUUID(),
      {
        branch_id: branch,
        cashbox_id: cashbox,
        category_id: category,
        amount: "20",
        occurred_at: at,
        description: "Reporting office expense",
      },
    ])
  )[0].id;
  const tx = (
    await rows("select public.financial_operation_details($1,'expense',$2) v", [
      tenant,
      expense,
    ])
  )[0].v.transaction_id;
  await rows("select public.reverse_financial_transaction($1,$2,$3,$4,$5)", [
    tenant,
    tx,
    randomUUID(),
    new Date().toISOString(),
    "Expense correction today",
  ]);
  await rows("select public.post_cashbox_transfer($1,$2,$3,$4,$5,$6,$7)", [
    tenant,
    randomUUID(),
    cashbox,
    otherBox,
    "100",
    at,
    "Branch comparison transfer",
  ]);
  const report = async (kind, f = {}, page = 0) =>
    (
      await rows("select public.financial_report($1,$2,$3,$4) v", [
        tenant,
        kind,
        f,
        page,
      ])
    )[0].v;
  const dash = async (f = {}) =>
    (await rows("select public.financial_dashboard($1,$2) v", [tenant, f]))[0]
      .v;
  await t.test("all ten reports execute and emit decimal strings", async () => {
    for (const kind of [
      "payments",
      "debts",
      "overdue",
      "expenses",
      "cashbox_transactions",
      "cashbox_balances",
      "branches",
      "refunds",
      "customer_statement",
      "audit",
    ]) {
      const r = await report(
        kind,
        kind === "customer_statement" ? { customer } : {},
      );
      assert.ok(r.total > 0, kind);
      for (const row of r.rows)
        for (const key of [
          "amount",
          "received",
          "allocated",
          "credit",
          "refunded",
          "outstanding",
          "balance",
          "debt_change",
          "cash_received",
          "cash_refunded",
        ])
          if (row[key] != null)
            assert.match(row[key], /^-?\d+\.\d{2}$/, kind + " " + key);
    }
  });
  await t.test(
    "dashboard distinguishes gross receipts/refunds, net expenses, debt and all-time balance",
    async () => {
      const d = await dash();
      assert.equal(d.metrics.received, "60.00");
      assert.equal(d.metrics.refunds, "10.00");
      assert.equal(d.metrics.net_collections, "50.00");
      assert.equal(d.metrics.expenses, "0.00");
      assert.equal(d.metrics.outstanding, "60.00");
      assert.equal(d.metrics.overdue, "60.00");
      assert.equal(d.metrics.invoiced, "100.00");
      assert.equal(d.metrics.cashbox_balance, "1050.00");
      assert.equal(d.metrics.net_cash_movement, "1050.00");
      assert.equal(d.branches.length, 2);
      assert.ok(d.recent.length > 0);
    },
  );
  await t.test(
    "date/actor/method/category/box filters and timezone bounds use real records",
    async () => {
      assert.equal(
        (
          await report("payments", {
            from: dates.past,
            to: dates.past,
            actor: uid(1),
            method: "cash",
            cashbox,
          })
        ).total,
        1,
      );
      assert.equal((await report("payments", { from: dates.today })).total, 0);
      assert.equal(
        (await report("payments", { method: "bank_transfer" })).total,
        0,
      );
      assert.equal(
        (
          await report("expenses", {
            category,
            cashbox,
            from: dates.past,
            to: dates.past,
          })
        ).total,
        1,
      );
      const d = await dash({ from: dates.past, to: dates.past });
      assert.equal(d.metrics.expenses, "20.00");
      assert.equal(d.metrics.cashbox_balance, "1050.00");
      assert.equal(d.metrics.outstanding, "60.00");
      const today = await dash({ from: dates.today, to: dates.today });
      assert.equal(today.metrics.expenses, "-20.00");
      await assert.rejects(
        report("payments", { from: dates.today, to: dates.past }),
        /filters/,
      );
    },
  );
  await t.test(
    "customer statement separates cash from debt and current credit includes refunds",
    async () => {
      const r = await report("customer_statement", { customer });
      assert.ok(
        r.rows.some((v) => v.kind === "issue" && v.debt_change === "100.00"),
      );
      assert.ok(
        r.rows.some(
          (v) => v.kind === "allocation" && v.debt_change === "-40.00",
        ),
      );
      assert.ok(
        r.rows.some((v) => v.kind === "payment" && v.cash_received === "60.00"),
      );
      assert.ok(
        r.rows.some((v) => v.kind === "refund" && v.cash_refunded === "10.00"),
      );
      assert.equal((await report("payments")).rows[0].credit, "10.00");
    },
  );
  await t.test(
    "limited branches, employees, foreign and unauthenticated identities cannot bypass reports",
    async () => {
      await db.exec("reset role");
      for (const [n, role] of [
        [3, "manager"],
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
      assert.equal((await report("branches")).total, 1);
      assert.equal((await dash()).metrics.cashbox_balance, "950.00");
      await assert.rejects(report("payments", { branch: second }), /denied/);
      assert.equal((await report("audit")).total, 0);
      await as(4);
      await assert.rejects(dash(), /denied/);
      await as(2);
      await assert.rejects(report("payments"), /denied/);
      await as(0);
      await assert.rejects(report("cashbox_balances"), /denied/);
      await as(1);
    },
  );
  await t.test(
    "filter options expose only authorized historical names and cashboxes",
    async () => {
      const r = (
        await rows("select public.financial_report_options($1,$2) v", [
          tenant,
          { branch },
        ])
      )[0].v;
      assert.equal(r.customers.length, 1);
      assert.equal(r.cashboxes.length, 1);
      assert.equal(r.actors[0].id, uid(1));
    },
  );
  await t.test(
    "cash source filters include linked refunds/reversals, exports are exact and bounded",
    async () => {
      assert.equal(
        (await report("cashbox_transactions", { customer })).total,
        2,
      );
      assert.equal(
        (await report("cashbox_transactions", { category })).total,
        2,
      );
      assert.equal(
        (await report("refunds", { method: "bank_transfer" })).total,
        0,
      );
      await rows(
        "select public.post_cashbox_entry($1,$2,$3,'adjustment','9007199254740993.01','Exact large amount')",
        [tenant, cashbox, randomUUID()],
      );
      const exported = (
        await rows(
          "select public.financial_report_export($1,'cashbox_balances',$2) v",
          [tenant, { cashbox }],
        )
      )[0].v;
      assert.equal(exported.rows[0].balance, "9007199254741943.01");
      await db.exec("reset role");
      await rows(
        "insert into public.financial_audit_events(tenant_id,cashbox_id,operation,actor_id,actor_name,after_data) select $1,$2,'cashbox_updated',$3,'Test recorder','{}'::jsonb from generate_series(1,5001)",
        [tenant, cashbox, uid(1)],
      );
      await as(1);
      await assert.rejects(
        rows("select public.financial_report_export($1,'audit')", [tenant]),
        /5000 rows/,
      );
      assert.ok((await report("audit")).total > 5000);
    },
  );
});
