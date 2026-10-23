import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("financial foundation: exact immutable postings and scoped cashboxes", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const uid = (n) => `81000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 6; n++)
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [uid(n), `finance${n}@example.test`, { full_name: `Finance Actor ${n}` }],
    );
  await as(1);
  const a = (await rows("select public.create_business('Finance A') id"))[0].id;
  const a1 = (await rows("select id from public.branches"))[0].id;
  const a2 = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Other branch') returning id",
      [a],
    )
  )[0].id;
  await as(2);
  const b = (await rows("select public.create_business('Finance B') id"))[0].id;
  const b1 = (await rows("select id from public.branches"))[0].id;
  await as(1);
  const save = async (branch = a1, data = {}, id = null, key = randomUUID()) =>
    (
      await rows("select public.save_cashbox($1,$2,$3,$4) id", [
        a,
        id,
        key,
        {
          branch_id: branch,
          name: "Cash drawer",
          cashbox_type: "cash",
          currency: "UZS",
          is_active: true,
          ...data,
        },
      ])
    )[0].id;
  const post = async (
    box,
    amount,
    kind = "adjustment",
    key = randomUUID(),
    reason = "Verified cash count",
  ) =>
    (
      await rows("select public.post_cashbox_entry($1,$2,$3,$4,$5,$6) id", [
        a,
        box,
        key,
        kind,
        amount,
        reason,
      ])
    )[0].id;
  const detail = async (box, filter = {}, page = 0) =>
    (
      await rows("select public.cashbox_details($1,$2,$3,$4) value", [
        a,
        box,
        filter,
        page,
      ])
    )[0].value;
  let box, second, wide, opening, emp;
  await t.test(
    "cashbox creation is idempotent and never seeds sample balances",
    async () => {
      const key = randomUUID();
      box = await save(a1, {}, null, key);
      assert.equal(await save(a1, {}, null, key), box);
      await assert.rejects(
        save(a1, { name: "Changed request" }, null, key),
        /Request identifier/,
      );
      second = await save(a2, { name: "Other drawer" });
      wide = await save(null, { name: "Business bank", cashbox_type: "bank" });
      assert.equal((await detail(box)).balance, "0.00");
      assert.equal((await detail(box)).audit_total, 1);
      await assert.rejects(save(b1), /denied|authorized/);
      await assert.rejects(save(a1, { currency: "USD" }), /Invalid cashbox/);
    },
  );
  await t.test(
    "opening, exact fractional additions and negative corrections derive one authoritative balance",
    async () => {
      opening = await post(box, "100.10", "opening_balance");
      await post(box, "0.20");
      await post(box, "-0.30");
      const d = await detail(box);
      assert.equal(d.balance, "100.00");
      assert.equal(d.total, 3);
      assert.ok(
        d.rows.every(
          (r) => typeof r.amount === "string" && r.actor_id === uid(1),
        ),
      );
      assert.equal(d.audit_total, 4);
      await assert.rejects(post(box, "1", "opening_balance"), /first posting/);
      assert.equal((await detail(box)).total, 3);
    },
  );
  await t.test(
    "zero, negative opening, nondecimal, oversize and excess precision are rejected without rounding",
    async () => {
      for (const amount of [
        "0",
        "-0.00",
        "0.001",
        "1.999",
        "1e3",
        "NaN",
        "Infinity",
        "10000000000000000",
        "1,000",
        " 1",
        "01",
        "",
      ])
        await assert.rejects(post(second, amount), /Amount|decimal/);
      await assert.rejects(post(second, "-1", "opening_balance"), /positive/);
      await assert.rejects(post(second, "1", "payment"), /supported/);
      await assert.rejects(
        post(second, "1", "adjustment", randomUUID(), "x"),
        /reason/,
      );
      await assert.rejects(post(box, "-100.01"), /Insufficient/);
      assert.equal((await detail(box)).balance, "100.00");
      assert.equal((await detail(second)).total, 0);
    },
  );
  await t.test(
    "money beyond safe JS integer range remains exact decimal text end-to-end",
    async () => {
      await post(second, "9999999999999999.99", "opening_balance");
      await post(second, "0.01");
      assert.equal((await detail(second)).balance, "10000000000000000.00");
      const list = (
        await rows("select public.cashbox_directory($1,$2) value", [
          a,
          { sort: "balance" },
        ])
      )[0].value;
      assert.equal(list.rows[0].id, second);
      assert.equal(list.rows[0].balance, "10000000000000000.00");
    },
  );
  await t.test(
    "repeated postings return same transaction; changed payloads or actors cannot reuse keys",
    async () => {
      const key = randomUUID(),
        id = await post(box, "1", "adjustment", key);
      assert.equal(await post(box, "1.00", "adjustment", key), id);
      await assert.rejects(
        post(box, "2", "adjustment", key),
        /Request identifier/,
      );
      await assert.rejects(
        post(wide, "1", "adjustment", key),
        /Request identifier/,
      );
      assert.equal((await detail(box)).balance, "101.00");
    },
  );
  await t.test(
    "configuration has optimistic concurrency, immutable branch/currency and complete before/after audit",
    async () => {
      await save(a1, { name: "Renamed drawer", version: 1 }, box);
      await assert.rejects(
        save(a1, { name: "Stale", version: 1 }, box),
        /changed/,
      );
      await assert.rejects(save(a2, { version: 2 }, box), /cannot change/);
      const d = await detail(box);
      const event = d.audit.find((e) => e.operation === "cashbox_updated");
      assert.equal(event.before_data.name, "Cash drawer");
      assert.equal(event.after_data.name, "Renamed drawer");
      assert.equal(d.balance, "101.00");
    },
  );
  await t.test(
    "inactive cashboxes and branches reject new postings but retain history and safe replay",
    async () => {
      const key = randomUUID();
      await post(box, "1", "adjustment", key);
      await save(
        a1,
        { name: "Renamed drawer", version: 2, is_active: false },
        box,
      );
      assert.equal((await detail(box)).balance, "102.00");
      assert.ok(await post(box, "1.00", "adjustment", key));
      await assert.rejects(post(box, "1"), /active cashbox/);
      await save(a1, { name: "Renamed drawer", version: 3 }, box);
      await rows("update public.branches set is_active=false where id=$1", [
        a1,
      ]);
      await assert.rejects(post(box, "1"), /active cashbox/);
      await rows("update public.branches set is_active=true where id=$1", [a1]);
    },
  );
  await t.test(
    "atomic rollback prevents ledger or envelope remnants when audit insertion fails",
    async () => {
      await db.exec(
        "reset role;create function public.finance_test_failure() returns trigger language plpgsql as $$begin raise exception 'Injected finance audit failure';end$$;create trigger finance_test_failure before insert on public.financial_audit_events for each row execute function public.finance_test_failure();",
      );
      await as(1);
      const before = (await detail(box)).total;
      const key = randomUUID();
      await assert.rejects(post(box, "5", "adjustment", key), /Injected/);
      assert.equal((await detail(box)).total, before);
      await db.exec(
        "reset role;drop trigger finance_test_failure on public.financial_audit_events;drop function public.finance_test_failure();",
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.financial_transactions where idempotency_key=$1",
            [key],
          )
        )[0].n,
        0,
      );
      await as(1);
      await post(box, "5", "adjustment", key);
      assert.equal((await detail(box)).balance, "107.00");
    },
  );
  await t.test(
    "posted financial records are immutable even to accidental privileged DML; incomplete envelopes fail",
    async () => {
      await db.exec("reset role");
      for (const table of [
        "financial_transactions",
        "financial_ledger_entries",
        "financial_audit_events",
      ]) {
        await assert.rejects(
          rows(`delete from public.${table} where tenant_id=$1`, [a]),
          /immutable/,
        );
      }
      await assert.rejects(
        rows(
          "update public.financial_ledger_entries set amount=50 where transaction_id=$1",
          [opening],
        ),
        /immutable/,
      );
      await assert.rejects(
        rows(
          "insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values($1,$2,$3,'opening_balance','UZS',1)",
          [a, opening, wide],
        ),
        /Incomplete/,
      );
      await assert.rejects(
        rows(
          "insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values($1,$2,$3,'opening_balance','UZS',0.001)",
          [a, opening, wide],
        ),
        /check constraint/,
      );
      await assert.rejects(
        rows("delete from public.cashboxes where id=$1", [box]),
        /retained/,
      );
      await assert.rejects(
        rows("update public.cashboxes set branch_id=$1 where id=$2", [a2, box]),
        /cannot change/,
      );
      await assert.rejects(
        rows(
          "insert into public.financial_transactions(tenant_id,kind,currency,idempotency_key,request_payload,reason,actor_id,actor_name) values($1,'adjustment','UZS',$2,'{}','No leg',$3,'Actor')",
          [a, randomUUID(), uid(1)],
        ),
        /Incomplete/,
      );
      await as(1);
      for (const table of [
        "cashboxes",
        "financial_transactions",
        "financial_ledger_entries",
        "financial_audit_events",
      ])
        await assert.rejects(
          rows(`delete from public.${table}`),
          /permission denied/,
        );
      await assert.rejects(
        rows("select amount from public.financial_ledger_entries"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "existing role engine grants manager branch cashboxes, cashier read-only, and employee/teacher no finance",
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
          [a, uid(n), role],
        );
        await rows(
          "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
          [a, a1, uid(n)],
        );
      }
      await as(3);
      assert.equal((await detail(box)).balance, "107.00");
      assert.equal((await detail(box)).audit_total, 0);
      await save(a1, { name: "Manager drawer" });
      await assert.rejects(save(a2), /denied/);
      await assert.rejects(save(null), /denied/);
      await assert.rejects(detail(second), /denied/);
      await assert.rejects(detail(wide), /denied/);
      await assert.rejects(post(box, "1"), /denied/);
      for (const n of [4, 5, 6]) {
        await as(n);
        if (n === 4) assert.equal((await detail(box)).balance, "107.00");
        else await assert.rejects(detail(box), /denied/);
        await assert.rejects(save(a1), /denied/);
        await assert.rejects(post(box, "1"), /denied/);
      }
    },
  );
  await t.test(
    "explicit custom branch permissions allow adjustments only in assigned scope; HR deactivation revokes access",
    async () => {
      await db.exec("reset role");
      const role = (
        await rows(
          "insert into public.business_roles(tenant_id,name,scope) values($1,'Finance operator','branch') returning id",
          [a],
        )
      )[0].id;
      for (const p of [
        "tenant.read",
        "branches.view",
        "cashboxes.view",
        "cashboxes.adjust",
        "finance.audit.view",
      ])
        await rows(
          "insert into public.business_role_permissions values($1,$2,$3)",
          [a, role, p],
        );
      await rows(
        "update public.tenant_memberships set role_id=$1 where tenant_id=$2 and user_id=$3",
        [role, a, uid(4)],
      );
      await as(4);
      await post(box, "0.01");
      assert.ok((await detail(box)).audit_total > 0);
      await assert.rejects(post(second, "1"), /denied/);
      await db.exec("reset role");
      emp = (
        await rows(
          "insert into public.employees(tenant_id,user_id,full_name,start_date) values($1,$2,'Operator','2026-10-23') returning id",
          [a, uid(4)],
        )
      )[0].id;
      await as(4);
      await post(box, "0.02");
      assert.equal(
        (await detail(box)).rows.find((r) => r.employee_id === emp).actor_name,
        "Finance Actor 4",
      );
      await db.exec("reset role");
      await rows("update public.employees set status='inactive' where id=$1", [
        emp,
      ]);
      await as(4);
      await assert.rejects(detail(box), /denied/);
      await assert.rejects(post(box, "1"), /denied/);
      await as(1);
      assert.equal((await detail(box)).balance, "107.03");
    },
  );
  await t.test(
    "tenant and subject manipulation cannot read or mutate financial records through RPCs or RLS",
    async () => {
      for (const n of [2, 0]) {
        await as(n);
        assert.equal(
          (
            await rows("select id from public.cashboxes where tenant_id=$1", [
              a,
            ])
          ).length,
          0,
        );
        await assert.rejects(detail(box), /denied/);
        await assert.rejects(post(box, "1"), /denied/);
        await assert.rejects(save(a1), /denied/);
      }
      await as(1);
      await assert.rejects(
        rows("select public.cashbox_directory($1)", [b]),
        /denied/,
      );
      await db.exec("reset role;set role anon");
      await assert.rejects(
        rows("select public.cashbox_directory($1)", [a]),
        /permission denied/,
      );
      await as(1);
    },
  );
  await t.test(
    "cashbox filters, pagination, transaction type/actor and inclusive business-timezone dates use real rows",
    async () => {
      for (let n = 0; n < 21; n++)
        await save(a1, { name: `Paged drawer ${String(n).padStart(2, "0")}` });
      const list = (
        await rows("select public.cashbox_directory($1,$2,1) value", [
          a,
          { q: "Paged drawer" },
        ])
      )[0].value;
      assert.equal(list.total, 21);
      assert.equal(list.rows.length, 1);
      assert.equal((await detail(box, { kind: "opening_balance" })).total, 1);
      assert.equal((await detail(box, { actor: uid(4) })).total, 2);
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      assert.equal(
        (await detail(box, { from: date, to: date })).total,
        (await detail(box)).total,
      );
      assert.equal(
        (await detail(box, { from: "2000-01-01", to: "2000-01-01" })).total,
        0,
      );
      await assert.rejects(
        detail(box, { from: "2026-10-23", to: "2026-10-22" }),
        /reversed/,
      );
    },
  );
  await t.test(
    "inclusive date filters use tenant midnight boundaries rather than UTC days",
    async () => {
      await as(1);
      const timed = await save(a1, { name: "Timezone boundary drawer" });
      await db.exec("reset role");
      for (const at of [
        "2026-10-22T18:59:59Z",
        "2026-10-22T19:00:00Z",
        "2026-10-23T18:59:59Z",
        "2026-10-23T19:00:00Z",
      ]) {
        await db.exec("begin");
        const id = (
          await rows(
            "insert into public.financial_transactions(tenant_id,kind,currency,idempotency_key,request_payload,reason,actor_id,actor_name,posted_at) values($1,'adjustment','UZS',$2,'{}','Boundary fixture',$3,'Boundary actor',$4) returning id",
            [a, randomUUID(), uid(1), at],
          )
        )[0].id;
        await rows(
          "insert into public.financial_ledger_entries(tenant_id,transaction_id,cashbox_id,kind,currency,amount) values($1,$2,$3,'adjustment','UZS',1)",
          [a, id, timed],
        );
        await rows(
          "insert into public.financial_audit_events(tenant_id,cashbox_id,transaction_id,operation,actor_id,actor_name,after_data) values($1,$2,$3,'adjustment',$4,'Boundary actor','{}')",
          [a, timed, id, uid(1)],
        );
        await db.exec("commit");
      }
      await as(1);
      const result = await detail(timed, {
        from: "2026-10-23",
        to: "2026-10-23",
      });
      assert.equal(result.total, 2);
      assert.equal(result.balance, "4.00");
      assert.deepEqual(
        result.rows.map((r) => new Date(r.posted_at).toISOString()),
        ["2026-10-23T18:59:59.000Z", "2026-10-22T19:00:00.000Z"],
      );
    },
  );
});
