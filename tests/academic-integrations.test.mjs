import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("academic reports, original student views and explicit finance integration", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, a = []) => (await db.query(q, a)).rows;
  const value = async (q, a = []) => (await rows(q, a))[0].v;
  const uid = (n) => `93000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const as = async (n) => {
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  const inspect = async (q, a = []) => {
    await db.exec("reset role");
    try {
      return await rows(q, a);
    } finally {
      await as(1);
    }
  };
  for (let n = 1; n <= 7; n++)
    await rows("insert into auth.users(id,email) values($1,$2)", [
      uid(n),
      `academic${n}@example.test`,
    ]);
  await as(1);
  const tenant = await value(
      "select public.create_business('Integrated academics') v",
    ),
    branch = (await rows("select id from public.branches"))[0].id,
    second = await value(
      "insert into public.branches(tenant_id,name) values($1,'Other academic branch') returning id v",
      [tenant],
    );
  const day = async (n) =>
    value(
      "select ((now() at time zone 'Asia/Tashkent')::date+$1::integer)::text v",
      [n],
    );
  const today = await day(0),
    yesterday = await day(-1),
    tomorrow = await day(1),
    start = await day(-30),
    end = await day(30);
  const course = await value("select public.save_course($1,null,$2,0,$3) v", [
    tenant,
    randomUUID(),
    {
      name: "Original course",
      standard_price: "123.45",
      pricing_model: "monthly",
    },
  ]);
  const group = async (name, b = branch, cap = "5") =>
    value("select public.save_study_group($1,null,$2,0,$3) v", [
      tenant,
      randomUUID(),
      {
        branch_id: b,
        course_id: course,
        name,
        start_date: start,
        end_date: end,
        capacity: cap,
      },
    ]);
  const g1 = await group("Full group", branch, "1"),
    g2 = await group("Near capacity", branch, "5"),
    g3 = await group("Other branch group", second);
  await db.exec("reset role");
  for (const [n, key, branches] of [
    [2, "teacher", [branch]],
    [3, "manager", [branch]],
    [4, "employee", [branch]],
    [6, "teacher", [branch, second]],
  ]) {
    await rows(
      "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key=$3",
      [tenant, uid(n), key],
    );
    for (const b of branches)
      await rows(
        "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
        [tenant, b, uid(n)],
      );
  }
  await as(1);
  const employee = async (n, branches) => {
    const id = await value(
      "select public.save_employee($1,null,$2,'',$3,'Instructor','active',$4,'',$5) v",
      [
        tenant,
        `Academic teacher ${n}`,
        `academic${n}@example.test`,
        today,
        branches,
      ],
    );
    await db.exec("reset role");
    await rows("update public.employees set user_id=$1 where id=$2", [
      uid(n),
      id,
    ]);
    await as(1);
    return id;
  };
  const teacher = await employee(2, [branch]),
    other = await employee(6, [branch, second]);
  for (const [g, e] of [
    [g1, teacher],
    [g2, other],
    [g3, other],
  ]) {
    await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
      tenant,
      g,
      randomUUID(),
      [e],
      e,
    ]);
    await rows(
      "select public.change_group_status($1,$2,$3,2,'active','Start academics')",
      [tenant, g, randomUUID()],
    );
  }
  const student = async (name, branches = [branch]) =>
    value("select public.save_student($1,$2,null,$3,$4,$5) v", [
      tenant,
      randomUUID(),
      { first_name: name, phone: "99890" + Math.floor(Math.random() * 1e7) },
      {},
      branches,
    ]);
  const pupil = await student("Original integrated student"),
    shared = await student("Cross branch student", [branch, second]);
  const guardian = await value(
    "select public.save_student_guardian($1,$2,null,'Parent remains guardian','998909991','','Parent',true) v",
    [tenant, pupil],
  );
  const enroll = (s, g, status = "active", price = "9007199254740993.12") =>
    value("select public.create_student_enrollment($1,$2,$3,$4,$5) v", [
      tenant,
      g,
      s,
      randomUUID(),
      {
        enrollment_date: today,
        effective_start_date: start,
        status,
        agreed_price: price,
        pricing_model: "monthly",
        notes: "Private agreement note",
      },
    ]);
  const enrollment = await enroll(pupil, g1),
    another = await enroll(pupil, g2, "active", "123.45");
  for (let n = 0; n < 3; n++)
    await enroll(await student(`Pending seat ${n}`), g2, "pending", "123.45");
  const cross = await enroll(shared, g3, "active", "150.00");
  const room = await value("select public.save_classroom($1,null,$2,0,$3) v", [
    tenant,
    randomUUID(),
    { name: "Active classroom", branch_id: branch, capacity: "12" },
  ]);
  await value("select public.save_classroom($1,null,$2,0,$3) v", [
    tenant,
    randomUUID(),
    { name: "Other classroom", branch_id: second, capacity: "12" },
  ]);
  const lesson = (g, e, date, extra = {}) =>
    value(
      "select public.save_lesson($1,$2,null,$3,0,$4,'Integrated planning') v",
      [
        tenant,
        g,
        randomUUID(),
        {
          local_start: date + "T10:00",
          local_end: date + "T11:00",
          timezone: "Asia/Tashkent",
          teacher_id: e,
          classroom_id: g === g1 ? room : null,
          title: "Integrated lesson",
          notes: "Private planning note",
          ...extra,
        },
      ],
    );
  const future = await lesson(g1, teacher, tomorrow),
    past = await lesson(g1, teacher, yesterday),
    cancel = await lesson(g1, teacher, await day(2)),
    otherLesson = await lesson(g3, other, tomorrow);
  await rows(
    "select public.transition_lesson($1,$2,$3,1,'completed','Expected roster captured')",
    [tenant, past, randomUUID()],
  );
  await rows(
    "select public.transition_lesson($1,$2,$3,1,'cancelled','Schedule correction')",
    [tenant, cancel, randomUUID()],
  );
  const report = (f = {}, p = 0) =>
    value("select public.academic_overview($1,$2,$3) v", [
      tenant,
      { from: start, to: end, ...f },
      p,
    ]);
  const summary = (s = pupil, p = 0) =>
    value("select public.student_academic_summary($1,$2,$3) v", [tenant, s, p]);
  const lessons = (s = pupil, f = {}, p = 0, calendar = false) =>
    value("select public.student_lesson_directory($1,$2,$3,$4,$5) v", [
      tenant,
      s,
      { from: start, to: end, ...f },
      p,
      calendar,
    ]);
  const bill = (
    e = enrollment,
    key = randomUUID(),
    version = 1,
    desc = "Monthly tuition explicitly reviewed",
  ) =>
    value(
      "select public.create_enrollment_invoice_draft($1,$2,$3,$4,$5,$5,$6) v",
      [tenant, e, key, version, today, desc],
    );
  const billing = (e = enrollment, p = 0) =>
    value("select public.enrollment_billing_details($1,$2,$3) v", [
      tenant,
      e,
      p,
    ]);
  let draft;
  await t.test(
    "counts distinct students separately from enrollments and reserve pending seats",
    async () => {
      const r = await report();
      assert.equal(r.stats.unique_active_students, 2);
      assert.equal(r.stats.active_enrollments, 3);
      assert.equal(r.stats.active_groups, 3);
      assert.equal(r.stats.active_courses, 1);
      assert.equal(r.stats.teachers, 2);
      assert.equal(r.stats.near_capacity, 1);
      assert.equal(r.stats.at_capacity, 1);
      assert.equal(r.stats.available_classrooms, 2);
      assert.equal(r.stats.upcoming_lessons, 2);
      assert.equal(r.stats.completed_lessons, 1);
      assert.equal((await report({ capacity: "near" })).rows[0].id, g2);
      assert.equal((await report({ capacity: "full" })).rows[0].id, g1);
      const s = await summary();
      assert.equal(s.active_courses, 1);
      assert.equal(s.active_groups, 2);
      assert.equal(s.historical_enrollments, 2);
    },
  );
  await t.test(
    "branch, course, teacher and date filters intersect authorized scope",
    async () => {
      const b = await report({ branch });
      assert.equal(b.stats.unique_active_students, 1);
      assert.equal(b.stats.active_enrollments, 2);
      assert.equal(b.stats.available_classrooms, 1);
      const a = await report({ teacher });
      assert.equal(a.total, 1);
      assert.equal(a.stats.upcoming_lessons, 1);
      assert.equal(a.stats.completed_lessons, 1);
      assert.equal(
        (await report({ course: randomUUID() })).stats.active_enrollments,
        0,
      );
      assert.equal(
        (await report({ from: await day(31), to: await day(40) })).total,
        0,
      );
      await assert.rejects(report({ from: "2026-02-30" }));
      await assert.rejects(report({ to: "2030-01-01" }));
      await assert.rejects(report({ teacher: "tampered" }));
    },
  );
  await t.test(
    "student timetable and history never include a different student's group",
    async () => {
      const d = await lessons();
      assert.deepEqual(
        new Set(d.rows.map((l) => l.id)),
        new Set([future, past, cancel]),
      );
      assert.ok(!d.rows.some((l) => l.id === otherLesson));
      assert.equal(
        (await lessons(pupil, { status: "completed" })).rows[0].id,
        past,
      );
      assert.equal(
        (await lessons(pupil, { status: "cancelled" })).rows[0].id,
        cancel,
      );
      const history = await summary();
      assert.ok(history.activity.rows.some((a) => a.lesson_id === past));
      assert.ok(
        history.activity.rows.some((a) => a.enrollment_id === enrollment),
      );
      assert.ok(!JSON.stringify(history).includes("Private agreement"));
      assert.ok(!JSON.stringify(history).includes("Private planning"));
      const directory = await value(
        "select public.student_enrollment_directory($1,$2) v",
        [tenant, pupil],
      );
      assert.equal(directory.total, 2);
      assert.equal(directory.rows[0].group_status, "active");
      assert.ok(
        directory.rows.every((e) => e.teachers.includes("Academic teacher")),
      );
    },
  );
  await t.test(
    "draft uses existing invoice command, exact agreement and original debtor; same request replays",
    async () => {
      const before = await value(
        "select public.customer_financial_profile($1,$2) v",
        [tenant, pupil],
      );
      const key = randomUUID();
      draft = await bill(enrollment, key);
      assert.equal(await bill(enrollment, key), draft);
      const d = await value("select public.invoice_details($1,$2) v", [
        tenant,
        draft,
      ]);
      assert.equal(d.invoice.customer_id, pupil);
      assert.equal(d.invoice.state, "draft");
      assert.equal(d.invoice.branch_id, branch);
      assert.equal(d.invoice.items[0].unit_price, "9007199254740993.12");
      assert.equal(
        (
          await inspect(
            "select count(*)::integer n from public.invoice_receivable_entries where tenant_id=$1",
            [tenant],
          )
        )[0].n,
        0,
      );
      assert.equal(
        (
          await inspect(
            "select count(*)::integer n from public.financial_audit_events where tenant_id=$1 and invoice_id=$2",
            [tenant, draft],
          )
        )[0].n,
        1,
      );
      const after = await value(
        "select public.customer_financial_profile($1,$2) v",
        [tenant, pupil],
      );
      assert.deepEqual(after.summary, before.summary);
      assert.deepEqual(after.payment_summary, before.payment_summary);
      assert.equal((await billing()).total, 1);
      assert.equal((await summary()).invoices.rows[0].id, draft);
      assert.equal(
        (
          await value("select public.invoice_enrollment_source($1,$2) v", [
            tenant,
            draft,
          ])
        ).enrollment_id,
        enrollment,
      );
      await assert.rejects(bill(enrollment, key, 1, "Reused request changed"));
      await assert.rejects(bill(enrollment, randomUUID(), 2));
    },
  );
  await t.test(
    "linked draft can be reviewed normally but cannot move debtor or branch",
    async () => {
      const save = (customer, b = branch) =>
        value("select public.save_invoice_draft($1,$2,$3,1,$4,$5) v", [
          tenant,
          draft,
          randomUUID(),
          {
            customer_id: customer,
            branch_id: b,
            issue_date: today,
            due_date: today,
            discount_amount: "0",
          },
          [
            {
              description: "Reviewed tuition",
              quantity: "1",
              unit_price: "123.45",
              discount_amount: "0",
            },
          ],
        ]);
      await assert.rejects(save(shared));
      await assert.rejects(save(pupil, second));
      await save(pupil);
      assert.equal((await billing()).rows[0].total, "123.45");
      await assert.rejects(
        rows("delete from public.enrollment_invoice_links where tenant_id=$1", [
          tenant,
        ]),
      );
      await assert.rejects(
        rows(
          "insert into public.enrollment_invoice_links select * from public.enrollment_invoice_links",
        ),
      );
      const r = await rows(
        "select id from public.guardians where tenant_id=$1",
        [tenant],
      );
      assert.ok(r.some((g) => g.id === guardian));
    },
  );
  await t.test(
    "teacher sees assigned academic aggregates but no invoice metadata, prices or finance actions",
    async () => {
      await as(2);
      const r = await report();
      assert.equal(r.total, 1);
      assert.equal(r.stats.active_enrollments, 1);
      assert.equal(r.stats.unique_active_students, 1);
      assert.equal((await report({ branch: second })).total, 0);
      const b = await billing();
      assert.equal(b.can_create, false);
      assert.equal(b.can_view, false);
      assert.deepEqual(b.rows, []);
      assert.equal(b.total, 0);
      assert.equal(
        (await rows("select * from public.enrollment_invoice_links")).length,
        0,
      );
      await assert.rejects(bill());
      await assert.rejects(
        value("select public.invoice_enrollment_source($1,$2) v", [
          tenant,
          draft,
        ]),
      );
      await assert.rejects(summary());
      await assert.rejects(lessons());
      const text = JSON.stringify(r);
      assert.ok(!text.includes("9007199254740993"));
      assert.ok(!text.includes("Private agreement"));
      await as(1);
    },
  );
  await t.test(
    "manager cannot broaden branch scope or inspect a whole shared student profile",
    async () => {
      await as(3);
      assert.equal((await report()).total, 2);
      assert.equal((await report({ branch: second })).total, 0);
      assert.equal((await report({ teacher: other })).total, 1);
      await assert.rejects(summary(shared));
      await assert.rejects(lessons(shared));
      await assert.rejects(bill(cross));
      await as(1);
    },
  );
  await t.test(
    "foreign business, employee, subjectless and anonymous access cannot bypass IDs",
    async () => {
      await as(5);
      const foreign = await value(
        "select public.create_business('Other tenant') v",
      );
      await assert.rejects(report());
      await assert.rejects(summary());
      await assert.rejects(lessons());
      await assert.rejects(bill());
      await assert.rejects(billing());
      assert.equal(
        (await rows("select * from public.enrollment_invoice_links")).length,
        0,
      );
      assert.equal(
        (
          await value("select public.academic_overview($1,$2) v", [
            foreign,
            { from: today, to: today },
          ])
        ).total,
        0,
      );
      for (const n of [4, null]) {
        await as(n);
        await assert.rejects(report());
        await assert.rejects(bill());
        await assert.rejects(summary());
      }
      await db.exec("reset role;set role anon");
      await assert.rejects(report());
      await assert.rejects(summary());
      await as(1);
    },
  );
  await t.test(
    "captured roster survives enrollment withdrawal, while future membership follows dates",
    async () => {
      await rows("select public.update_student_enrollment($1,$2,$3,1,$4)", [
        tenant,
        enrollment,
        randomUUID(),
        {
          status: "withdrawn",
          effective_start_date: start,
          effective_end_date: today,
          reason: "Withdraw after completed lesson",
        },
      ]);
      const d = await lessons();
      assert.ok(d.rows.some((l) => l.id === past));
      assert.ok(!d.rows.some((l) => l.id === future));
      assert.equal((await billing()).total, 1);
      assert.equal((await report({ branch })).stats.active_enrollments, 1);
      assert.equal(
        (await value("select public.invoice_details($1,$2) v", [tenant, draft]))
          .invoice.customer_id,
        pupil,
      );
      assert.equal((await summary()).active_groups, 1);
    },
  );
  await t.test(
    "only the existing issue operation creates a receivable; academic views do not post",
    async () => {
      await rows("select public.transition_invoice($1,$2,$3,2,'issue','')", [
        tenant,
        draft,
        randomUUID(),
      ]);
      const before = await value(
        "select public.customer_financial_profile($1,$2) v",
        [tenant, pupil],
      );
      assert.equal(before.summary.outstanding, "123.45");
      await report();
      await summary();
      await lessons();
      assert.deepEqual(
        await value("select public.customer_financial_profile($1,$2) v", [
          tenant,
          pupil,
        ]),
        before,
      );
      assert.equal(
        (
          await inspect(
            "select count(*)::integer n from public.invoice_receivable_entries where tenant_id=$1",
            [tenant],
          )
        )[0].n,
        1,
      );
      assert.equal((await billing()).rows[0].state, "issued");
    },
  );
  await t.test(
    "student lesson, linked invoice and report pages retain exact totals and stable pagination",
    async () => {
      for (let n = 0; n < 25; n++) await lesson(g2, other, await day(n + 3));
      const first = await lessons(pupil, {
          from: await day(3),
          to: await day(28),
        }),
        next = await lessons(
          pupil,
          { from: await day(3), to: await day(28) },
          1,
        );
      assert.equal(first.total, 25);
      assert.equal(first.rows.length, 20);
      assert.equal(next.rows.length, 5);
      assert.ok(!first.rows.some((l) => next.rows.some((r) => r.id === l.id)));
      const calendar = await lessons(
        pupil,
        { from: today, to: await day(30) },
        0,
        true,
      );
      assert.equal(calendar.rows.length, 25);
      assert.equal(calendar.page_size, 200);
      await assert.rejects(
        lessons(pupil, { from: today, to: await day(42) }, 0, true),
      );
      for (let n = 0; n < 21; n++)
        await bill(
          another,
          randomUUID(),
          1,
          `Reviewed manual monthly charge ${n}`,
        );
      assert.equal((await billing(another)).rows.length, 20);
      assert.equal((await billing(another, 1)).rows.length, 1);
      assert.equal((await billing(another)).total, 21);
      const s = await summary();
      assert.equal(s.invoices.total, 22);
      assert.equal(s.invoices.rows.length, 20);
      assert.equal(s.activity.rows.length, 20);
      assert.ok((await summary(pupil, 1)).activity.rows.length > 0);
      for (let n = 0; n < 21; n++) await group(`Paged report group ${n}`);
      const a = await report(),
        b = await report({}, 1);
      assert.equal(a.total, 24);
      assert.equal(a.rows.length, 20);
      assert.equal(b.rows.length, 4);
      assert.ok(!a.rows.some((g) => b.rows.some((r) => r.id === g.id)));
    },
  );
  await t.test(
    "catalog price updates do not rewrite agreed tuition or linked draft amounts",
    async () => {
      await rows("select public.save_course($1,$2,$3,1,$4)", [
        tenant,
        course,
        randomUUID(),
        {
          name: "Changed catalog template",
          standard_price: "999.99",
          pricing_model: "fixed_course",
        },
      ]);
      assert.equal(
        (
          await value("select public.student_enrollment_details($1,$2) v", [
            tenant,
            another,
          ])
        ).enrollment.agreed_price,
        "123.45",
      );
      assert.equal((await billing(another)).rows[0].total, "123.45");
    },
  );
});
