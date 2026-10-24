import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
test("student-first identity, atomic conversion and existing financial compatibility", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, args = []) => (await db.query(q, args)).rows;
  const uid = (n) => `88000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
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
      `studentfirst${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
      await rows("select public.create_business('Student first') id")
    )[0].id,
    branch = (await rows("select id from public.branches"))[0].id,
    second = (
      await rows(
        "insert into public.branches(tenant_id,name) values($1,'Hidden student branch') returning id",
        [tenant],
      )
    )[0].id;
  const save = async (
    profile = {},
    student = {},
    id = null,
    key = randomUUID(),
    extra = {},
  ) =>
    (
      await rows(
        "select public.save_student($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id",
        [
          tenant,
          key,
          id,
          { first_name: "New student", phone: "998901112", ...profile },
          student,
          extra.branches ?? [branch],
          [],
          {},
          extra.confirm ?? false,
          extra.mode ?? "create",
        ],
      )
    )[0].id;
  const lead = async (name = "Converted student") => {
    const pipeline = (
      await rows(
        "select id from public.sales_pipelines where tenant_id=$1 and is_default",
        [tenant],
      )
    )[0].id;
    return (
      await rows("select public.save_lead($1,null,$2) id", [
        tenant,
        {
          branch_id: branch,
          pipeline_id: pipeline,
          stage_id: (
            await rows(
              "select id from public.sales_stages where tenant_id=$1 and pipeline_id=$2 and outcome='open' order by position limit 1",
              [tenant, pipeline],
            )
          )[0].id,
          first_name: name,
          phone: "998907771",
        },
      ])
    )[0].id;
  };
  const convert = async (l) =>
    (
      await rows("select public.convert_lead_to_student($1,$2) id", [tenant, l])
    )[0].id;
  let student, contact, converted;
  await t.test(
    "one command creates shared identity, student, branch and immutable retry receipt",
    async () => {
      const key = randomUUID();
      student = await save({}, {}, null, key);
      assert.equal(await save({}, {}, null, key), student);
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        1,
      );
      assert.equal(
        (await rows("select customer_id from public.student_profiles"))[0]
          .customer_id,
        student,
      );
      assert.match(
        (
          await rows("select student_identifier from public.student_profiles")
        )[0].student_identifier,
        /^ST-/,
      );
      await assert.rejects(
        save({ first_name: "Changed" }, {}, null, key),
        /different details/,
      );
    },
  );
  await t.test(
    "duplicate review is mandatory for a separate matching identity; family numbers remain supported",
    async () => {
      await assert.rejects(save(), /Possible existing/);
      const sibling = await save(
        { first_name: "Sibling" },
        {},
        null,
        randomUUID(),
        { confirm: true },
      );
      assert.notEqual(sibling, student);
    },
  );
  await t.test(
    "invalid student fields roll back identity, assignments, audit and request receipt",
    async () => {
      const before = (
        await rows("select count(*)::int n from public.customers")
      )[0].n;
      await assert.rejects(
        save(
          { first_name: "Invalid profile", phone: "998900000" },
          { education_status: "invalid" },
        ),
        /check constraint/,
      );
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        before,
      );
    },
  );
  await t.test(
    "promoting a contact preserves ID and existing exact invoice/payment links",
    async () => {
      contact = (
        await rows("select public.save_customer($1,null,$2,$3) id", [
          tenant,
          { first_name: "Existing contact", phone: "998906661" },
          [branch],
        ])
      )[0].id;
      const today = (
        await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
      )[0].d;
      const invoice = (
        await rows("select public.save_invoice_draft($1,null,$2,0,$3,$4) id", [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            customer_id: contact,
            issue_date: today,
            due_date: today,
            discount_amount: "0",
          },
          [
            {
              description: "Existing charge",
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
          { branch_id: branch, name: "Student cashbox", cashbox_type: "cash" },
        ])
      )[0].id;
      const payment = (
        await rows("select public.post_payment($1,$2,$3,$4) id", [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            customer_id: contact,
            cashbox_id: box,
            amount: "60.10",
            method: "cash",
            paid_at: today + "T00:00:00+05:00",
          },
          [{ invoice_id: invoice, amount: "40" }],
        ])
      )[0].id;
      const before = (
        await rows("select public.customer_financial_profile($1,$2) v", [
          tenant,
          contact,
        ])
      )[0].v;
      assert.equal(
        await save(
          { first_name: "Existing contact", phone: "998906661" },
          {},
          contact,
        ),
        contact,
      );
      assert.deepEqual(
        (
          await rows("select public.customer_financial_profile($1,$2) v", [
            tenant,
            contact,
          ])
        )[0].v,
        before,
      );
      assert.equal(
        (
          await rows("select public.payment_details($1,$2) v", [
            tenant,
            payment,
          ])
        )[0].v.payment.credit,
        "20.10",
      );
      assert.equal(before.summary.outstanding, "60.00");
    },
  );
  await t.test(
    "edits use the same authoritative contact and preserve an existing generated student identifier",
    async () => {
      const identifier = (
        await rows(
          "select student_identifier from public.student_profiles where customer_id=$1",
          [student],
        )
      )[0].student_identifier;
      await save(
        { first_name: "Updated student", phone: "998901112" },
        { education_status: "on_hold" },
        student,
        randomUUID(),
        { mode: "edit" },
      );
      assert.equal(
        (
          await rows("select first_name from public.customers where id=$1", [
            student,
          ])
        )[0].first_name,
        "Updated student",
      );
      assert.equal(
        (
          await rows(
            "select student_identifier from public.student_profiles where customer_id=$1",
            [student],
          )
        )[0].student_identifier,
        identifier,
      );
    },
  );
  await t.test(
    "lead conversion creates one student, retains attribution and retries without duplicates",
    async () => {
      const l = await lead();
      converted = await convert(l);
      assert.equal(await convert(l), converted);
      assert.equal(
        (await rows("select customer_id from public.leads where id=$1", [l]))[0]
          .customer_id,
        converted,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.student_profiles where customer_id=$1",
            [converted],
          )
        )[0].n,
        1,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.customer_activities where customer_id=$1 and kind='lead_converted'",
            [converted],
          )
        )[0].n,
        1,
      );
    },
  );
  await t.test(
    "failed student conversion rolls back lead, new identity and conversion history",
    async () => {
      const l = await lead("Rollback student");
      const before = (
        await rows("select count(*)::int n from public.customers")
      )[0].n;
      await assert.rejects(
        rows("select public.convert_lead_to_student($1,$2,null,null,true,$3)", [
          tenant,
          l,
          { education_status: "invalid" },
        ]),
        /check constraint/,
      );
      assert.equal(
        (await rows("select status from public.leads where id=$1", [l]))[0]
          .status,
        "open",
      );
      assert.equal(
        (await rows("select count(*)::int n from public.customers"))[0].n,
        before,
      );
    },
  );
  await t.test(
    "generic conversion stays generic; historical converted contact can explicitly become a student",
    async () => {
      const l = await lead("Generic converted");
      const id = (
        await rows("select public.convert_lead($1,$2,null,null,true) id", [
          tenant,
          l,
        ])
      )[0].id;
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.student_profiles where customer_id=$1",
            [id],
          )
        )[0].n,
        0,
      );
      assert.equal(await convert(l), id);
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.student_profiles where customer_id=$1",
            [id],
          )
        )[0].n,
        1,
      );
    },
  );
  await t.test(
    "guardians are reusable contacts and do not become students",
    async () => {
      const guardian = (
        await rows(
          "select public.save_student_guardian($1,$2,null,'Shared parent','998908881','','Parent',true) id",
          [tenant, student],
        )
      )[0].id;
      await rows(
        "select public.save_student_guardian($1,$2,$3,'','','','Parent',false)",
        [tenant, contact, guardian],
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.student_guardians where guardian_id=$1",
            [guardian],
          )
        )[0].n,
        2,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::int n from public.student_profiles where customer_id=$1",
            [guardian],
          )
        )[0].n,
        0,
      );
    },
  );
  await t.test(
    "tenant, branch/all-assigned scope and direct write boundaries are retained",
    async () => {
      await db.exec("reset role");
      await rows(
        "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key='manager'",
        [tenant, uid(3)],
      );
      await rows(
        "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
        [tenant, branch, uid(3)],
      );
      await as(1);
      const shared = await save(
        { first_name: "Shared across branches", phone: "998905551" },
        {},
        null,
        randomUUID(),
        { branches: [branch, second] },
      );
      await as(3);
      assert.equal(
        (
          await rows(
            "select * from public.student_profiles where customer_id=$1",
            [shared],
          )
        ).length,
        0,
      );
      await assert.rejects(save({ phone: "998903331" }, {}, shared), /denied/);
      await assert.rejects(
        save({ phone: "998903331" }, {}, null, randomUUID(), {
          branches: [second],
        }),
        /denied/,
      );
      await as(2);
      await assert.rejects(save(), /denied/);
      await as(0);
      await assert.rejects(save(), /denied/);
      await as(1);
      await assert.rejects(
        rows(
          "insert into public.student_save_requests(tenant_id,request_id,actor_id,customer_id,request_payload) values($1,$2,$3,$4,$5)",
          [tenant, randomUUID(), uid(1), student, {}],
        ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "payment-only profile readers receive credit without invoice/debt access",
    async () => {
      const role = (
        await rows(
          "select public.save_business_role($1,null,'Payment reader','branch',array['branches.view','customers.view','payments.view','cashboxes.view']) id",
          [tenant],
        )
      )[0].id;
      await rows("select public.assign_member_role($1,$2,$3,$4)", [
        tenant,
        uid(3),
        role,
        [branch],
      ]);
      await as(3);
      const profile = (
        await rows("select public.customer_payment_profile($1,$2) v", [
          tenant,
          contact,
        ])
      )[0].v;
      assert.equal(profile.payment_summary.credit, "20.10");
      assert.equal(profile.summary, undefined);
      await assert.rejects(
        rows("select public.customer_financial_profile($1,$2)", [
          tenant,
          contact,
        ]),
        /denied/,
      );
      await as(2);
      await assert.rejects(
        rows("select public.customer_payment_profile($1,$2)", [
          tenant,
          contact,
        ]),
        /denied/,
      );
      await as(1);
    },
  );
});
