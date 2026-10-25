import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
test("7A populated upgrade preserves student, guardians, conversion, salary and posted financial history", async (t) => {
  const directory = new URL("../supabase/migrations/", import.meta.url),
    files = (await readdir(directory)).filter((f) => f.endsWith(".sql")).sort(),
    boundary = files.findIndex((f) => f.startsWith("20261025000100"));
  assert.ok(boundary > 0);
  const db = await createTestDatabase({ migrationCount: boundary });
  t.after(() => db.close());
  const rows = async (q, args = []) => (await db.query(q, args)).rows,
    uid = "90000000-0000-0000-0000-000000000001";
  await rows("insert into auth.users(id,email) values($1,$2)", [
    uid,
    "academic-upgrade@example.test",
  ]);
  await rows("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec("set role authenticated");
  const tenant = (
      await rows("select public.create_business('Pre-LMS business') id")
    )[0].id,
    branch = (await rows("select id from public.branches"))[0].id;
  const student = (
    await rows("select public.save_student($1,$2,null,$3,$4,$5) id", [
      tenant,
      randomUUID(),
      { first_name: "Preserved student", phone: "998907771111" },
      { student_identifier: "PRESERVED-STUDENT" },
      [branch],
    ])
  )[0].id;
  await rows(
    "select public.save_student_guardian($1,$2,null,'Preserved parent','998907771112','','Parent',true)",
    [tenant, student],
  );
  const employee = (
    await rows(
      "select public.save_employee($1,null,'Preserved teacher','','','Teacher','active','2026-10-22','',array[$2]::uuid[]) id",
      [tenant, branch],
    )
  )[0].id;
  await rows(
    "select public.save_employee_salary($1,$2,'fixed_monthly','9007199254740993.12','','','','','UZS','Existing salary configuration')",
    [tenant, employee],
  );
  const pipeline = (
      await rows(
        "select id from public.sales_pipelines where tenant_id=$1 and is_default",
        [tenant],
      )
    )[0].id,
    stage = (
      await rows(
        "select id from public.sales_stages where tenant_id=$1 and outcome='open' order by position limit 1",
        [tenant],
      )
    )[0].id;
  const lead = (
    await rows("select public.save_lead($1,null,$2) id", [
      tenant,
      {
        branch_id: branch,
        pipeline_id: pipeline,
        stage_id: stage,
        first_name: "Preserved enquiry",
        phone: "998907771111",
      },
    ])
  )[0].id;
  await rows("select public.convert_lead_to_student($1,$2,$3)", [
    tenant,
    lead,
    student,
  ]);
  const today = (
      await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
    )[0].d,
    invoice = (
      await rows("select public.save_invoice_draft($1,null,$2,0,$3,$4) id", [
        tenant,
        randomUUID(),
        {
          branch_id: branch,
          customer_id: student,
          issue_date: today,
          due_date: today,
          discount_amount: "0",
        },
        [
          {
            description: "Preserved invoice",
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
  const box = (
    await rows("select public.save_cashbox($1,null,$2,$3) id", [
      tenant,
      randomUUID(),
      { branch_id: branch, name: "Preserved drawer", cashbox_type: "cash" },
    ])
  )[0].id;
  await rows("select public.post_payment($1,$2,$3,$4)", [
    tenant,
    randomUUID(),
    {
      branch_id: branch,
      customer_id: student,
      cashbox_id: box,
      amount: "60.10",
      paid_at: today + "T00:00:00+05:00",
      method: "cash",
    },
    [{ invoice_id: invoice, amount: "40" }],
  ]);
  const snapshot = async () => {
    await db.exec("reset role");
    const result = {};
    for (const table of [
      "customers",
      "student_profiles",
      "student_guardians",
      "guardians",
      "leads",
      "employees",
      "employee_salary_settings",
      "financial_transactions",
      "financial_ledger_entries",
      "financial_audit_events",
      "payments",
      "payment_allocations",
      "invoices",
      "invoice_items",
      "invoice_receivable_entries",
    ])
      result[table] = (
        await rows(
          `select md5(coalesce(string_agg(row_to_json(x)::text,'' order by row_to_json(x)::text),'')) hash from public.${table} x`,
        )
      )[0].hash;
    await db.exec("set role authenticated");
    return result;
  };
  const before = await snapshot(),
    finance = (
      await rows("select public.customer_financial_profile($1,$2) v", [
        tenant,
        student,
      ])
    )[0].v;
  await db.exec("reset role");
  for (const file of files.slice(boundary))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.exec("set role authenticated");
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(
    (
      await rows("select public.customer_financial_profile($1,$2) v", [
        tenant,
        student,
      ])
    )[0].v,
    finance,
  );
  const course = (
    await rows("select public.save_course($1,null,$2,0,$3) id", [
      tenant,
      randomUUID(),
      {
        name: "New academic catalog course",
        standard_price: "750000.10",
        pricing_model: "monthly",
      },
    ])
  )[0].id;
  await rows("select public.save_course($1,$2,$3,1,$4)", [
    tenant,
    course,
    randomUUID(),
    {
      name: "Updated catalog template",
      standard_price: "1000000.00",
      pricing_model: "fixed_course",
    },
  ]);
  await rows("select public.save_classroom($1,null,$2,0,$3)", [
    tenant,
    randomUUID(),
    { branch_id: branch, name: "Real classroom", capacity: "12" },
  ]);
  assert.deepEqual(await snapshot(), before);
  assert.equal(finance.summary.outstanding, "60.00");
  assert.equal(finance.payment_summary.credit, "20.10");
  assert.equal(
    (
      await rows("select public.get_employee_salary($1,$2) v", [
        tenant,
        employee,
      ])
    )[0].v.amount,
    "9007199254740993.12",
  );
  assert.equal(
    (await rows("select to_regclass('public.student_enrollments') v"))[0].v,
    null,
  );
  assert.equal(
    (await rows("select to_regclass('public.lessons') v"))[0].v,
    null,
  );
});
