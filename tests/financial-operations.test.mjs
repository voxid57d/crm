import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("expenses, transfers, refunds and reversible immutable history", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const uid = (n) => `86000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
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
      `operation${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
    await rows("select public.create_business('Operations A') id")
  )[0].id;
  const branch = (await rows("select id from public.branches"))[0].id;
  const second = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Second operations') returning id",
      [tenant],
    )
  )[0].id;
  const box = async (b) =>
    (
      await rows("select public.save_cashbox($1,null,$2,$3) id", [
        tenant,
        randomUUID(),
        { branch_id: b, name: "Operations drawer", cashbox_type: "cash" },
      ])
    )[0].id;
  const cashbox = await box(branch),
    destination = await box(branch),
    hidden = await box(second);
  await rows(
    "select public.post_cashbox_entry($1,$2,$3,'opening_balance','1000','Initial reserve')",
    [tenant, cashbox, randomUUID()],
  );
  const category = (
    await rows("select public.expense_category_directory($1) v", [tenant])
  )[0].v[0].id;
  const today = (
      await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
    )[0].d,
    at = today + "T00:00:00+05:00";
  const now = () => new Date().toISOString();
  const bal = async (c) =>
    (await rows("select public.cashbox_details($1,$2) v", [tenant, c]))[0].v
      .balance;
  const detail = async (kind, id) =>
    (
      await rows("select public.financial_operation_details($1,$2,$3) v", [
        tenant,
        kind,
        id,
      ])
    )[0].v;
  const expense = async (amount, key = randomUUID()) =>
    (
      await rows("select public.post_expense($1,$2,$3) id", [
        tenant,
        key,
        {
          branch_id: branch,
          cashbox_id: cashbox,
          category_id: category,
          amount,
          occurred_at: at,
          description: "Office purchase",
          vendor: "Local shop",
        },
      ])
    )[0].id;
  const transfer = async (amount, dest = destination, key = randomUUID()) =>
    (
      await rows(
        "select public.post_cashbox_transfer($1,$2,$3,$4,$5,$6,$7) id",
        [tenant, key, cashbox, dest, amount, at, "Fund another drawer"],
      )
    )[0].id;
  const customer = (
    await rows("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Refund customer", phone: "998900999" },
      [branch],
    ])
  )[0].id;
  const invoice = (
    await rows("select public.save_invoice_draft($1,null,$2,0,$3,$4) id", [
      tenant,
      randomUUID(),
      {
        branch_id: branch,
        customer_id: customer,
        issue_date: today,
        due_date: today,
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
        amount: "100",
        method: "cash",
        paid_at: at,
      },
      [{ invoice_id: invoice, amount: "80" }],
    ])
  )[0].id;
  const refund = async (amount) =>
    (
      await rows("select public.post_payment_refund($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        payment,
        randomUUID(),
        cashbox,
        amount,
        now(),
        "Customer requested refund",
      ])
    )[0].id;
  let spent, moved;
  await t.test(
    "expense posts exact negative cash with immutable category snapshot",
    async () => {
      spent = await expense("100.10");
      assert.equal(await bal(cashbox), "999.90");
      assert.equal((await detail("expense", spent)).amount, "100.10");
    },
  );
  await t.test(
    "transfer is atomic, balanced, same-currency and exactly retryable",
    async () => {
      const k = randomUUID();
      moved = await transfer("200", destination, k);
      assert.equal(await transfer("200.00", destination, k), moved);
      assert.equal(await bal(cashbox), "799.90");
      assert.equal(await bal(destination), "200.00");
      await assert.rejects(transfer("900"), /Insufficient/);
      assert.equal(await bal(destination), "200.00");
      await assert.rejects(transfer("1", cashbox), /different/);
    },
  );
  await t.test(
    "refund uses credit first then releases allocated debt; cash and remaining cap are exact",
    async () => {
      await refund("10");
      let p = (
        await rows("select public.payment_details($1,$2) v", [tenant, payment])
      )[0].v.payment;
      assert.equal(p.credit, "10.00");
      await refund("30");
      p = (
        await rows("select public.payment_details($1,$2) v", [tenant, payment])
      )[0].v.payment;
      assert.equal(p.credit, "0.00");
      assert.equal(p.allocated, "60.00");
      assert.equal(
        (
          await rows("select public.invoice_details($1,$2) v", [
            tenant,
            invoice,
          ])
        )[0].v.outstanding,
        "40.00",
      );
      assert.equal(await bal(cashbox), "759.90");
      await assert.rejects(refund("60.01"), /exceeds/);
      await assert.rejects(
        rows("select public.allocate_payment($1,$2,$3,$4,$5)", [
          tenant,
          payment,
          invoice,
          randomUUID(),
          "0.01",
        ]),
        /exceeds/,
      );
    },
  );
  await t.test(
    "full refund reopens original debt and prevents further refunds",
    async () => {
      await refund("60");
      assert.equal(
        (
          await rows("select public.invoice_details($1,$2) v", [
            tenant,
            invoice,
          ])
        )[0].v.outstanding,
        "100.00",
      );
      await assert.rejects(refund("0.01"), /exceeds/);
    },
  );
  await t.test(
    "reversals exactly offset original expenses and transfers, preserve history and reject duplicates",
    async () => {
      for (const [kind, id] of [
        ["expense", spent],
        ["transfer", moved],
      ]) {
        const d = await detail(kind, id);
        const key = randomUUID(),
          time = now();
        const args = [
          tenant,
          d.transaction_id,
          key,
          time,
          "Correct an erroneous posting",
        ];
        const result = (
          await rows(
            "select public.reverse_financial_transaction($1,$2,$3,$4,$5) id",
            args,
          )
        )[0].id;
        assert.equal(
          (
            await rows(
              "select public.reverse_financial_transaction($1,$2,$3,$4,$5) id",
              args,
            )
          )[0].id,
          result,
        );
        assert.equal((await detail(kind, id)).reversed, true);
        await assert.rejects(
          rows("select public.reverse_financial_transaction($1,$2,$3,$4,$5)", [
            tenant,
            d.transaction_id,
            randomUUID(),
            now(),
            "Attempt second reversal",
          ]),
          /already/,
        );
      }
      assert.equal(await bal(cashbox), "1000.00");
      assert.equal(await bal(destination), "0.00");
    },
  );
  await t.test(
    "default insufficient balance rejection and owner-only auditable overdraft policy",
    async () => {
      await assert.rejects(expense("1000.01"), /Insufficient/);
      const d = (
        await rows("select public.cashbox_details($1,$2) v", [tenant, cashbox])
      )[0].v;
      await rows("select public.set_cashbox_overdraft($1,$2,$3,true,$4,$5)", [
        tenant,
        cashbox,
        randomUUID(),
        d.cashbox.version,
        "Approved owner overdraft",
      ]);
      await expense("1000.01");
      assert.equal(await bal(cashbox), "-0.01");
      await assert.rejects(
        rows("select public.set_cashbox_overdraft($1,$2,$3,false,$4,$5)", [
          tenant,
          cashbox,
          randomUUID(),
          d.cashbox.version + 1,
          "Disable overdraft policy",
        ]),
        /nonnegative/,
      );
    },
  );
  await t.test(
    "assigned managers cannot transfer to hidden branch, reverse or change owner policy; employee and outsider denied",
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
      await assert.rejects(transfer("1", hidden), /both cashboxes/);
      await assert.rejects(
        rows("select public.set_cashbox_overdraft($1,$2,$3,true,2,$4)", [
          tenant,
          cashbox,
          randomUUID(),
          "Unauthorized policy",
        ]),
        /owner/,
      );
      await assert.rejects(detail("transfer", randomUUID()), /denied/);
      await as(4);
      await assert.rejects(expense("1"), /denied/);
      await as(2);
      await assert.rejects(detail("expense", spent), /denied/);
      await as(0);
      await assert.rejects(transfer("1"), /denied/);
      await as(1);
    },
  );
  await t.test(
    "source and ledger history resist direct mutation and orphan postings",
    async () => {
      await assert.rejects(
        rows("delete from public.expenses"),
        /permission denied/,
      );
      await db.exec("reset role");
      await assert.rejects(
        rows("delete from public.expenses where id=$1", [spent]),
        /immutable/,
      );
      await assert.rejects(
        rows("update public.payment_refunds set amount=1 where payment_id=$1", [
          payment,
        ]),
        /immutable/,
      );
      await as(1);
    },
  );
});
