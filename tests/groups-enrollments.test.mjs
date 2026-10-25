import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
test("groups, teaching eligibility, protected rosters, exact agreements and atomic transfers", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, a = []) => (await db.query(q, a)).rows;
  const uid = (n) => `91000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const as = async (n) => {
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  for (let n = 1; n <= 7; n++)
    await rows("insert into auth.users(id,email) values($1,$2)", [
      uid(n),
      `groups${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
      await rows("select public.create_business('Academics A') id")
    )[0].id,
    branch = (await rows("select id from public.branches"))[0].id,
    second = (
      await rows(
        "insert into public.branches(tenant_id,name) values($1,'Second learning branch') returning id",
        [tenant],
      )
    )[0].id;
  const today = (
    await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
  )[0].d;
  const course = (
    await rows("select public.save_course($1,null,$2,0,$3) id", [
      tenant,
      randomUUID(),
      {
        name: "English course",
        standard_price: "9007199254740993.01",
        pricing_model: "monthly",
      },
    ])
  )[0].id;
  const room = (
    await rows("select public.save_classroom($1,null,$2,0,$3) id", [
      tenant,
      randomUUID(),
      { branch_id: branch, name: "Room A", capacity: "4" },
    ])
  )[0].id;
  const student = async (n, branches = [branch]) =>
    (
      await rows("select public.save_student($1,$2,null,$3,$4,$5) id", [
        tenant,
        randomUUID(),
        {
          first_name: "Student " + n,
          phone: "99890555" + String(n).padStart(4, "0"),
        },
        { student_identifier: "S-" + n },
        branches,
      ])
    )[0].id;
  const pupils = [
    await student(1),
    await student(2),
    await student(3),
    await student(4),
  ];
  const group = async (extra = {}, id = null, v = 0, key = randomUUID()) =>
    (
      await rows("select public.save_study_group($1,$2,$3,$4,$5) id", [
        tenant,
        id,
        key,
        v,
        {
          branch_id: branch,
          course_id: course,
          name: "English group",
          start_date: today,
          capacity: "2",
          classroom_id: "",
          ...extra,
        },
      ])
    )[0].id;
  const gd = async (id) =>
    (await rows("select public.study_group_details($1,$2) d", [tenant, id]))[0]
      .d;
  const ed = async (id) =>
    (
      await rows("select public.student_enrollment_details($1,$2) d", [
        tenant,
        id,
      ])
    )[0].d;
  const state = async (id, v, s) =>
    (
      await rows("select public.change_group_status($1,$2,$3,$4,$5,$6) id", [
        tenant,
        id,
        randomUUID(),
        v,
        s,
        "Academic change",
      ])
    )[0].id;
  const agreement = {
    enrollment_date: today,
    effective_start_date: today,
    agreed_price: "9007199254740993.01",
    pricing_model: "monthly",
    notes: "Private academic note",
    status: "pending",
  };
  const enroll = async (g, c, data = {}, add = false, key = randomUUID()) =>
    (
      await rows(
        "select public.create_student_enrollment($1,$2,$3,$4,$5,$6) id",
        [tenant, g, c, key, { ...agreement, ...data }, add],
      )
    )[0].id;
  const change = async (id, v, status, extra = {}) =>
    (
      await rows("select public.update_student_enrollment($1,$2,$3,$4,$5) id", [
        tenant,
        id,
        randomUUID(),
        v,
        {
          status,
          effective_start_date: today,
          effective_end_date: ["withdrawn", "completed"].includes(status)
            ? today
            : "",
          notes: "Private academic note",
          reason: "Academic status change",
          ...extra,
        },
      ])
    )[0].id;
  const transfer = async (
    id,
    v,
    target,
    data = {},
    add = false,
    key = randomUUID(),
  ) =>
    (
      await rows(
        "select public.transfer_student_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) id",
        [
          tenant,
          id,
          target,
          key,
          v,
          today,
          { ...agreement, ...data },
          "Student group transfer",
          add,
        ],
      )
    )[0].id;
  let first, destination, enrollment, moved, teacher, foreign;
  await t.test(
    "groups persist, use one shared course at multiple branches, and immutable scope/valid rooms",
    async () => {
      first = await group({
        name: "Morning English",
        code: "ENG-1",
        classroom_id: room,
      });
      destination = await group({
        name: "Afternoon English",
        branch_id: second,
      });
      assert.equal(
        (await gd(first)).group.course_id,
        (await gd(destination)).group.course_id,
      );
      await assert.rejects(
        group({ branch_id: second, classroom_id: room }),
        /same-branch/,
      );
      await assert.rejects(
        group({ capacity: "5", classroom_id: room }),
        /capacity/,
      );
      await assert.rejects(group({ capacity: "0" }), /range/);
      await assert.rejects(group({ course_id: randomUUID() }), /active course/);
      await assert.rejects(group({ code: "eng-1" }), /unique/);
      await group(
        { name: "Morning English edited", classroom_id: room },
        first,
        1,
      );
      await assert.rejects(group({}, first, 1), /changed/);
      await assert.rejects(
        group({ branch_id: second }, first, 2),
        /cannot change/,
      );
      assert.equal((await gd(first)).counts.reserved_seats, 0);
    },
  );
  await t.test(
    "enrollment uses original profile, prices are exact strings and matching retries preserve identity",
    async () => {
      const key = randomUUID();
      enrollment = await enroll(first, pupils[0], {}, false, key);
      assert.equal(await enroll(first, pupils[0], {}, false, key), enrollment);
      await assert.rejects(
        enroll(first, pupils[1], {}, false, key),
        /identifier/,
      );
      const d = await ed(enrollment);
      assert.equal(d.enrollment.customer_id, pupils[0]);
      assert.equal(d.enrollment.agreed_price, agreement.agreed_price);
      assert.equal(d.student.identifier, "S-1");
      assert.equal(
        (await rows("select count(*) n from public.customers"))[0].n,
        4,
      );
      await assert.rejects(enroll(first, pupils[0]), /open enrollment/);
      for (const price of ["-1", "1.001", "1e3", 1])
        await assert.rejects(
          enroll(first, pupils[1], { agreed_price: price }),
          /Invalid|precision/,
        );
    },
  );
  await t.test(
    "pending/active/paused all reserve seats; duplicates and capacity shrink are blocked",
    async () => {
      const other = await enroll(first, pupils[1], { agreed_price: "0" });
      await assert.rejects(enroll(first, pupils[2]), /capacity/);
      await assert.rejects(
        group({ capacity: "1" }, first, 2),
        /reserved seats/,
      );
      await state(first, 2, "active");
      await change(enrollment, 1, "active");
      await change(enrollment, 2, "paused");
      assert.equal((await gd(first)).counts.reserved_seats, 2);
      await assert.rejects(enroll(first, pupils[2]), /capacity/);
      await change(other, 1, "cancelled");
      assert.equal((await gd(first)).counts.reserved_seats, 1);
      await change(enrollment, 3, "active");
      await assert.rejects(change(enrollment, 3, "paused"), /changed/);
    },
  );
  await t.test(
    "course price changes and academic lifecycle do not rewrite enrollment agreements",
    async () => {
      await rows("select public.save_course($1,$2,$3,1,$4)", [
        tenant,
        course,
        randomUUID(),
        {
          name: "English course",
          standard_price: "100",
          pricing_model: "per_lesson",
        },
      ]);
      assert.equal(
        (await ed(enrollment)).enrollment.agreed_price,
        agreement.agreed_price,
      );
      assert.equal((await ed(enrollment)).enrollment.pricing_model, "monthly");
      await assert.rejects(state(first, 3, "completed"), /Close reserved/);
      await assert.rejects(
        change(enrollment, 4, "withdrawn", { effective_end_date: "" }),
        /end date/,
      );
    },
  );
  await t.test(
    "failed full-group transfer rolls back source, history and branch additions",
    async () => {
      const full = await group({
        name: "Full group",
        branch_id: second,
        capacity: "1",
      });
      await enroll(full, pupils[2], {}, true);
      const before = await ed(enrollment);
      await assert.rejects(transfer(enrollment, 4, full, {}, true), /capacity/);
      assert.deepEqual(await ed(enrollment), before);
      assert.equal(
        (
          await rows(
            "select count(*) n from public.customer_branches where customer_id=$1 and branch_id=$2",
            [pupils[0], second],
          )
        )[0].n,
        0,
      );
    },
  );
  await t.test(
    "cross-branch transfer is explicit and atomic, preserves original agreement/history/branches and retries",
    async () => {
      await assert.rejects(
        transfer(enrollment, 4, destination),
        /branch addition/,
      );
      assert.equal((await ed(enrollment)).enrollment.status, "active");
      const key = randomUUID();
      moved = await transfer(
        enrollment,
        4,
        destination,
        { agreed_price: "750000.10" },
        true,
        key,
      );
      assert.equal(
        await transfer(
          enrollment,
          4,
          destination,
          { agreed_price: "750000.10" },
          true,
          key,
        ),
        moved,
      );
      const old = await ed(enrollment),
        next = await ed(moved);
      assert.equal(old.enrollment.status, "withdrawn");
      assert.equal(old.enrollment.agreed_price, agreement.agreed_price);
      assert.equal(old.transferred_to, moved);
      assert.equal(next.enrollment.customer_id, pupils[0]);
      assert.equal(next.enrollment.transferred_from_id, enrollment);
      assert.equal(next.enrollment.agreed_price, "750000.10");
      assert.equal(
        (
          await rows(
            "select count(*) n from public.customer_branches where customer_id=$1",
            [pupils[0]],
          )
        )[0].n,
        2,
      );
    },
  );
  await t.test(
    "one original student can have different group enrollments without a second student identity",
    async () => {
      const more = await group({ name: "Extra English", branch_id: second });
      await enroll(more, pupils[0], { agreed_price: "0" });
      assert.equal(
        (
          await rows("select public.enrollment_directory($1,$2) d", [
            tenant,
            { student: pupils[0] },
          ])
        )[0].d.total,
        3,
      );
      assert.equal(
        (
          await rows("select public.course_group_summary($1,$2) d", [
            tenant,
            course,
          ])
        )[0].d.groups,
        4,
      );
    },
  );
  await t.test(
    "eligible linked employees support multiple teachers, a primary teacher and preserved replacement history",
    async () => {
      await db.exec("reset role");
      for (const [n, key, b] of [
        [3, "teacher", branch],
        [4, "teacher", branch],
        [5, "manager", branch],
        [6, "employee", branch],
      ]) {
        await rows(
          "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key=$3",
          [tenant, uid(n), key],
        );
        await rows(
          "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
          [tenant, b, uid(n)],
        );
      }
      await as(1);
      teacher = (
        await rows(
          "select public.save_employee($1,null,'Linked Teacher','','groups3@example.test','Teacher','active',$2,'',array[$3]::uuid[]) id",
          [tenant, today, branch],
        )
      )[0].id;
      const additional = (
        await rows(
          "select public.save_employee($1,null,'Additional Teacher','','groups4@example.test','Teacher','active',$2,'',array[$3]::uuid[]) id",
          [tenant, today, branch],
        )
      )[0].id;
      await db.exec("reset role");
      await rows("update public.employees set user_id=$1 where id=$2", [
        uid(3),
        teacher,
      ]);
      await rows("update public.employees set user_id=$1 where id=$2", [
        uid(4),
        additional,
      ]);
      await as(1);
      await rows("select public.set_group_teachers($1,$2,$3,3,$4,$5)", [
        tenant,
        first,
        randomUUID(),
        [teacher, additional],
        teacher,
      ]);
      assert.equal((await gd(first)).group.teachers.length, 2);
      await assert.rejects(
        rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
          tenant,
          destination,
          randomUUID(),
          [teacher],
          teacher,
        ]),
        /branch teaching/,
      );
      await rows("select public.set_group_teachers($1,$2,$3,4,$4,$5)", [
        tenant,
        first,
        randomUUID(),
        [additional],
        additional,
      ]);
      assert.equal((await gd(first)).teacher_history.length, 3);
      await rows("select public.set_group_teachers($1,$2,$3,5,$4,$5)", [
        tenant,
        first,
        randomUUID(),
        [teacher, additional],
        teacher,
      ]);
    },
  );
  await t.test(
    "teachers only read assigned groups and minimal rosters, never agreement prices/notes/history or finance",
    async () => {
      const activeEnr = await enroll(first, pupils[3], { status: "active" });
      await as(3);
      assert.equal((await gd(first)).group.id, first);
      await assert.rejects(gd(destination), /denied/);
      assert.equal(
        (await rows("select public.group_directory($1) d", [tenant]))[0].d
          .total,
        1,
      );
      const d = await ed(activeEnr);
      assert.ok(!("agreed_price" in d.enrollment));
      assert.ok(!("notes" in d.enrollment));
      assert.equal(d.history.total, 0);
      assert.equal(d.student.can_open, false);
      await assert.rejects(
        rows("select public.lms_history($1,$2)", [tenant, first]),
        /denied/,
      );
      await assert.rejects(state(first, 6, "paused"), /denied/);
      await assert.rejects(
        rows("select * from public.student_enrollments"),
        /permission denied/,
      );
      await assert.rejects(
        rows("select public.financial_report($1,'payments')", [tenant]),
        /denied/,
      );
      await as(1);
      await rows("select public.archive_employee($1,$2)", [tenant, teacher]);
      await as(3);
      await assert.rejects(gd(first), /denied/);
      await as(1);
    },
  );
  await t.test(
    "manager scopes and forged IDs cannot bypass source/destination authorization",
    async () => {
      await as(5);
      assert.equal((await gd(first)).group.id, first);
      await assert.rejects(gd(destination), /denied/);
      await assert.rejects(transfer(moved, 1, first), /both authorized/);
      await as(6);
      await assert.rejects(gd(first), /denied/);
      await as(1);
    },
  );
  await t.test(
    "foreign tenant, non-student, raw mutation, unauthenticated and privileged agreement rewrites fail",
    async () => {
      await as(2);
      foreign = (
        await rows("select public.create_business('Academic B') id")
      )[0].id;
      await assert.rejects(gd(first), /denied/);
      await assert.rejects(ed(moved), /denied/);
      assert.equal(
        (await rows("select count(*) n from public.study_groups"))[0].n,
        0,
      );
      await as(1);
      const contact = (
        await rows("select public.save_customer($1,null,$2,$3) id", [
          tenant,
          { first_name: "Generic contact", phone: "998905559999" },
          [branch],
        ])
      )[0].id;
      const empty = await group({ name: "Non-student guard" });
      await assert.rejects(enroll(empty, contact), /student profile/);
      await assert.rejects(group({ course_id: foreign }), /active course/);
      await assert.rejects(
        rows("delete from public.study_groups"),
        /permission denied/,
      );
      await assert.rejects(
        rows("select * from public.lms_commands"),
        /permission denied/,
      );
      await as(0);
      await assert.rejects(gd(first), /denied/);
      await as(1);
      await db.exec("reset role");
      await assert.rejects(
        rows(
          "update public.student_enrollments set agreed_price=1,version=version+1 where id=$1",
          [moved],
        ),
        /agreed tuition/,
      );
      await assert.rejects(
        rows("delete from public.student_enrollments where id=$1", [moved]),
        /retained/,
      );
      await as(1);
    },
  );
  await t.test(
    "source tuition authorization cannot be bypassed with pricing permission at the destination",
    async () => {
      const role = (
        await rows("select public.save_business_role($1,null,$2,$3,$4) id", [
          tenant,
          "Transfer without source pricing",
          "branch",
          [
            "groups.view",
            "enrollments.view",
            "enrollments.create",
            "enrollments.transfer",
            "enrollments.withdraw",
            "customers.view",
            "customers.update",
          ],
        ])
      )[0].id;
      const manager = (
        await rows(
          "select id from public.business_roles where tenant_id=$1 and system_key='manager'",
          [tenant],
        )
      )[0].id;
      await rows("select public.assign_member_role($1,$2,$3,$4,$5)", [
        tenant,
        uid(7),
        role,
        [branch, second],
        { [second]: manager },
      ]);
      const source = await group({ name: "Pricing permission source" }),
        id = await enroll(source, pupils[3]);
      await as(7);
      assert.ok(!("agreed_price" in (await ed(id)).enrollment));
      await assert.rejects(
        transfer(id, 1, destination, {}, true),
        /both authorized/,
      );
      await as(1);
      assert.equal((await ed(id)).enrollment.status, "pending");
    },
  );
  await t.test(
    "group/enrollment pagination, literal searches and authorized totals use real rows",
    async () => {
      for (let n = 0; n < 22; n++) {
        const id = await group({
          name: "Paged teaching " + String(n).padStart(2, "0"),
        });
        await enroll(id, pupils[1], { agreed_price: "0" });
      }
      const groups = (
        await rows("select public.group_directory($1,$2,1) d", [
          tenant,
          { q: "Paged teaching", sort: "name" },
        ])
      )[0].d;
      assert.equal(groups.total, 22);
      assert.equal(groups.rows.length, 2);
      assert.equal(groups.rows[0].name, "Paged teaching 20");
      const list = (
        await rows("select public.enrollment_directory($1,$2,1) d", [
          tenant,
          { q: "Paged teaching", student: pupils[1] },
        ])
      )[0].d;
      assert.equal(list.total, 22);
      assert.equal(list.rows.length, 2);
      assert.equal(
        (
          await rows("select public.group_directory($1,$2) d", [
            tenant,
            { q: "%" },
          ])
        )[0].d.total,
        0,
      );
      await as(5);
      assert.equal(
        (
          await rows("select public.group_directory($1,$2) d", [
            tenant,
            { branch: second },
          ])
        )[0].d.total,
        0,
      );
      await as(1);
    },
  );
  await t.test(
    "groups archive only after enrollment closure; old records and directory totals remain correct",
    async () => {
      await change(moved, 1, "cancelled");
      await state(destination, 1, "cancelled");
      await state(destination, 2, "archived");
      assert.equal((await gd(destination)).group.status, "archived");
      await assert.rejects(enroll(destination, pupils[1]), /planned\/active/);
      assert.equal(
        (
          await rows("select public.group_directory($1,$2) d", [
            tenant,
            { status: "archived" },
          ])
        )[0].d.total,
        1,
      );
    },
  );
});
