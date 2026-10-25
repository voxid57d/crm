import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { portableAttendanceFixture } from "./helpers/portable-attendance.mjs";
test("8B upgrade preserves populated attendance, lessons, contacts and posted financial history", async (t) => {
  const directory = new URL("../supabase/migrations/", import.meta.url),
    files = (await readdir(directory)).filter((s) => s.endsWith(".sql")).sort(),
    boundary = files.findIndex((s) => s.startsWith("20261026000800"));
  assert.ok(boundary > 0);
  const f = await portableAttendanceFixture(t, { migrationCount: boundary }),
    { db, rows, value, tenant, branch, pupil, today, old } = f;
  await f.prepare(old);
  const d = await f.detail(old);
  await f.save(
    old,
    1,
    d.rows.map((r) => ({
      record_id: r.id,
      status: "present",
      notes: "Finalized before calendar upgrade",
    })),
  );
  await f.finalize(old, 2);
  const attendance = await f.detail(old);
  const invoice = await value(
    "select public.save_invoice_draft($1,null,$2,0,$3,$4) v",
    [
      tenant,
      randomUUID(),
      {
        branch_id: branch,
        customer_id: pupil,
        issue_date: today,
        due_date: today,
        discount_amount: "0",
      },
      [
        {
          description: "Original financial source",
          quantity: "1",
          unit_price: "100",
          discount_amount: "0",
        },
      ],
    ],
  );
  await rows("select public.transition_invoice($1,$2,$3,1,'issue','')", [
    tenant,
    invoice,
    randomUUID(),
  ]);
  const box = await value("select public.save_cashbox($1,null,$2,$3) v", [
    tenant,
    randomUUID(),
    { branch_id: branch, name: "Original cash source", cashbox_type: "cash" },
  ]);
  await value("select public.post_payment($1,$2,$3,$4) v", [
    tenant,
    randomUUID(),
    {
      branch_id: branch,
      customer_id: pupil,
      cashbox_id: box,
      amount: "60.10",
      paid_at: today + "T00:00:00+05:00",
      method: "cash",
    },
    [{ invoice_id: invoice, amount: "40" }],
  ]);
  const finance = await value(
    "select public.customer_financial_profile($1,$2) v",
    [tenant, pupil],
  );
  assert.equal(finance.summary.outstanding, "60.00");
  assert.equal(finance.payment_summary.credit, "20.10");
  const snapshot = async () => {
    await db.exec("reset role");
    const hashes = {};
    for (const table of [
      "customers",
      "student_profiles",
      "student_enrollments",
      "lessons",
      "lesson_expected_students",
      "lesson_attendance_sheets",
      "lesson_attendance_records",
      "attendance_events",
      "invoices",
      "invoice_items",
      "invoice_receivable_entries",
      "payments",
      "payment_allocations",
      "financial_ledger_entries",
      "financial_audit_events",
    ]) {
      hashes[table] = (
        await rows(
          `select md5(coalesce(string_agg(row_to_json(x)::text,'' order by row_to_json(x)::text),'')) h from public.${table} x`,
        )
      )[0].h;
    }
    await db.exec("set role authenticated");
    return hashes;
  };
  const before = await snapshot();
  await db.exec("reset role");
  for (const file of files.slice(boundary))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.exec("set role authenticated");
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await f.detail(old), attendance);
  assert.deepEqual(
    await value("select public.customer_financial_profile($1,$2) v", [
      tenant,
      pupil,
    ]),
    finance,
  );
  await value("select public.save_academic_closure($1,null,$2,0,$3) v", [
    tenant,
    randomUUID(),
    {
      branch_id: branch,
      name: "New calendar period",
      reason: "Review existing future lesson",
      from_date: await f.day(5),
      to_date: await f.day(5),
      is_active: true,
    },
  ]);
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(
    rows(
      "select public.transition_lesson($1,$2,$3,1,'cancelled','Unsafe historical cancellation')",
      [tenant, old, randomUUID()],
    ),
  );
  assert.deepEqual(await f.detail(old), attendance);
});
