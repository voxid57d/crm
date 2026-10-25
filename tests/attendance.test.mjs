import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("attendance rosters, drafts, finalization, corrections and isolation", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, a = []) => (await db.query(q, a)).rows,
    value = async (q, a = []) => (await rows(q, a))[0].v;
  const uid = (n) => `94000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
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
      `attendance${n}@example.test`,
    ]);
  await as(1);
  const tenant = await value("select public.create_business('Attendance A') v"),
    branch = (await rows("select id from public.branches"))[0].id,
    second = await value(
      "insert into public.branches(tenant_id,name) values($1,'Other attendance branch') returning id v",
      [tenant],
    );
  const day = (n) =>
    value(
      "select ((now() at time zone 'Asia/Tashkent')::date+$1::integer)::text v",
      [n],
    );
  const today = await day(0),
    start = await day(-30);
  await db.exec("reset role");
  for (const [n, key, bs] of [
    [2, "teacher", [branch]],
    [3, "manager", [branch]],
    [4, "employee", [branch]],
    [6, "teacher", [branch, second]],
    [7, "teacher", [branch]],
  ]) {
    await rows(
      "insert into public.tenant_memberships(tenant_id,user_id,role_id) select $1,$2,id from public.business_roles where tenant_id=$1 and system_key=$3",
      [tenant, uid(n), key],
    );
    for (const b of bs)
      await rows(
        "insert into public.branch_memberships(tenant_id,branch_id,user_id) values($1,$2,$3)",
        [tenant, b, uid(n)],
      );
  }
  await as(1);
  const employee = async (n, bs) => {
    const id = await value(
      "select public.save_employee($1,null,$2,'',$3,'Teacher','active',$4,'',$5) v",
      [
        tenant,
        `Attendance teacher ${n}`,
        `attendance${n}@example.test`,
        start,
        bs,
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
    other = await employee(6, [branch, second]),
    sub = await employee(7, [branch]);
  const course = await value("select public.save_course($1,null,$2,0,$3) v", [
    tenant,
    randomUUID(),
    {
      name: "Attendance course",
      standard_price: "750000.10",
      pricing_model: "monthly",
    },
  ]);
  const group = async (name, b, e) => {
    const g = await value("select public.save_study_group($1,null,$2,0,$3) v", [
      tenant,
      randomUUID(),
      {
        name,
        branch_id: b,
        course_id: course,
        start_date: start,
        capacity: "50",
      },
    ]);
    await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
      tenant,
      g,
      randomUUID(),
      [e],
      e,
    ]);
    await rows(
      "select public.change_group_status($1,$2,$3,2,'active','Start attendance teaching')",
      [tenant, g, randomUUID()],
    );
    return g;
  };
  const g1 = await group("Main group", branch, teacher),
    g2 = await group("Colleague group", branch, other),
    g3 = await group("Restricted branch group", second, other);
  const student = async (name) =>
    value("select public.save_student($1,$2,null,$3,'{}',$4) v", [
      tenant,
      randomUUID(),
      { first_name: name, phone: "99890" + Math.floor(Math.random() * 1e7) },
      [branch],
    ]);
  const pupil = await student("Original attendance student"),
    late = await student("Joined later"),
    pending = await student("Pending student"),
    paused = await student("Paused student");
  const enroll = async (s, date = start, status = "active", g = g1) =>
    value("select public.create_student_enrollment($1,$2,$3,$4,$5) v", [
      tenant,
      g,
      s,
      randomUUID(),
      {
        enrollment_date: today,
        effective_start_date: date,
        status,
        agreed_price: "750000.10",
        pricing_model: "monthly",
        notes: "Private tuition contract",
      },
    ]);
  const enrollment = await enroll(pupil),
    lateEnrollment = await enroll(late, await day(-2)),
    pendingEnrollment = await enroll(pending, start, "pending"),
    pausedEnrollment = await enroll(paused);
  await rows("select public.update_student_enrollment($1,$2,$3,1,$4)", [
    tenant,
    pausedEnrollment,
    randomUUID(),
    {
      status: "paused",
      effective_start_date: start,
      reason: "Pause from recorded instant",
    },
  ]);
  const lesson = async (n, g = g1, e = teacher, extra = {}) =>
    value(
      "select public.save_lesson($1,$2,null,$3,0,$4,'Attendance lesson fixture') v",
      [
        tenant,
        g,
        randomUUID(),
        {
          local_start: (await day(n)) + "T10:00",
          local_end: (await day(n)) + "T11:00",
          timezone: "Asia/Tashkent",
          teacher_id: e,
          title: "Attendance lesson",
          ...extra,
        },
      ],
    );
  const old = await lesson(-5),
    recent = await lesson(-1),
    future = await lesson(5),
    subLesson = await lesson(-2, g1, teacher, { substitute_id: sub }),
    empty = await lesson(-1, g2, other),
    restricted = await lesson(-4, g3, other),
    cancelled = await lesson(-3);
  await rows(
    "select public.transition_lesson($1,$2,$3,1,'cancelled','Cancelled fixture')",
    [tenant, cancelled, randomUUID()],
  );
  const detail = (l = old, p = 0, h = 0) =>
    value("select public.attendance_sheet_details($1,$2,$3,$4) v", [
      tenant,
      l,
      p,
      h,
    ]);
  const prepare = (l = old, key = randomUUID()) =>
    value("select public.prepare_attendance_sheet($1,$2,$3) v", [
      tenant,
      l,
      key,
    ]);
  const save = (
    l,
    v,
    marks,
    correct = false,
    reason = "",
    key = randomUUID(),
  ) =>
    value("select public.save_attendance_marks($1,$2,$3,$4,$5,$6,$7) v", [
      tenant,
      l,
      key,
      v,
      marks,
      correct,
      reason,
    ]);
  const finalize = (l, v, empty = false, key = randomUUID()) =>
    value("select public.finalize_attendance_sheet($1,$2,$3,$4,$5) v", [
      tenant,
      l,
      key,
      v,
      empty,
    ]);
  const refresh = (l, v) =>
    value("select public.refresh_attendance_roster($1,$2,$3,$4) v", [
      tenant,
      l,
      randomUUID(),
      v,
    ]);
  const workspace = async (f = {}, p = 0) =>
    value("select public.attendance_lesson_directory($1,$2,$3) v", [
      tenant,
      { from: await day(-30), to: await day(30), view: "all", ...f },
      p,
    ]);
  const history = (f = {}, p = 0) =>
    value("select public.attendance_record_directory($1,$2,$3) v", [
      tenant,
      { from: start, to: today, ...f },
      p,
    ]);
  let sheet, marks;
  await t.test(
    "preview follows enrollment dates and historical pause facts, with Unmarked defaults",
    async () => {
      const d = await detail();
      assert.equal(d.sheet, null);
      assert.deepEqual(
        new Set(d.rows.map((r) => r.customer_id)),
        new Set([pupil, paused]),
      );
      assert.equal(d.counts.unmarked, 2);
      assert.ok(d.rows.every((r) => r.status === "unmarked"));
      assert.ok(!JSON.stringify(d).includes("Private tuition contract"));
      assert.ok(
        (await detail(recent)).rows.some((r) => r.customer_id === late),
      );
      assert.ok(
        !(await detail(future)).rows.some((r) => r.customer_id === paused),
      );
      assert.ok(!(await detail()).rows.some((r) => r.customer_id === pending));
      await assert.rejects(prepare(future));
      await assert.rejects(prepare(cancelled));
    },
  );
  await t.test(
    "prepare is idempotent and ties unique attendance rows to original identities",
    async () => {
      const key = randomUUID();
      sheet = await prepare(old, key);
      assert.equal(await prepare(old, key), sheet);
      assert.equal(await prepare(), sheet);
      const d = await detail();
      assert.equal(d.sheet.version, 1);
      assert.equal(d.sheet.state, "draft");
      assert.equal(
        d.rows.find((r) => r.customer_id === pupil).enrollment_id,
        enrollment,
      );
      assert.equal(d.counts.absent, 0);
      assert.equal(d.total, 2);
      await assert.rejects(
        rows(
          "insert into public.lesson_attendance_records select * from public.lesson_attendance_records",
        ),
      );
      await assert.rejects(
        rows("delete from public.lesson_attendance_records"),
      );
    },
  );
  await t.test(
    "draft saves partial marks, late minutes and notes without treating Unmarked as Absent",
    async () => {
      const d = await detail();
      marks = d.rows.map((r) => ({
        record_id: r.id,
        status: r.customer_id === pupil ? "late" : "unmarked",
        late_minutes: r.customer_id === pupil ? "7" : "",
        notes: r.customer_id === pupil ? "Arrived late" : "",
      }));
      const key = randomUUID();
      await save(old, 1, marks, false, "", key);
      assert.equal(await save(old, 1, marks, false, "", key), sheet);
      const after = await detail();
      assert.equal(after.sheet.version, 2);
      assert.equal(after.counts.late, 1);
      assert.equal(after.counts.unmarked, 1);
      assert.equal(after.counts.absent, 0);
      assert.equal(
        after.rows.find((r) => r.customer_id === pupil).late_minutes,
        7,
      );
      await assert.rejects(finalize(old, 2));
      await assert.rejects(save(old, 1, marks));
      await assert.rejects(
        save(old, 2, [{ ...marks[0], record_id: randomUUID() }]),
      );
      await assert.rejects(save(old, 2, [marks[0], marks[0]]));
      await assert.rejects(
        save(old, 2, [{ ...marks[0], status: "present", late_minutes: "7" }]),
      );
      assert.equal((await detail()).sheet.version, 2);
    },
  );
  await t.test(
    "teacher may manage the actual lesson but cannot finalize incomplete or correct history by default",
    async () => {
      await as(2);
      assert.equal((await detail()).can_manage, true);
      await assert.rejects(finalize(old, 2));
      const d = await detail();
      await save(
        old,
        2,
        d.rows.map((r) => ({
          record_id: r.id,
          status: "present",
          notes: "",
          late_minutes: "",
        })),
      );
      await finalize(old, 3);
      const f = await detail();
      assert.equal(f.sheet.state, "finalized");
      assert.equal(f.counts.present, 2);
      assert.equal(f.counts.unmarked, 0);
      assert.equal(f.can_correct, false);
      await assert.rejects(
        save(old, 4, [{ record_id: f.rows[0].id, status: "absent" }]),
      );
      await assert.rejects(
        save(
          old,
          4,
          [{ record_id: f.rows[0].id, status: "absent" }],
          true,
          "Teacher correction",
        ),
      );
      await assert.rejects(refresh(old, 4));
      await as(1);
    },
  );
  await t.test(
    "authorized finalized corrections retain before/after, actor and reason without reopening",
    async () => {
      const d = await detail(),
        id = d.rows.find((r) => r.customer_id === pupil).id;
      await assert.rejects(
        save(old, 4, [{ record_id: id, status: "absent" }], true, ""),
      );
      await save(
        old,
        4,
        [
          {
            record_id: id,
            status: "excused",
            notes: "Excused, no sensitive detail",
            late_minutes: "",
          },
        ],
        true,
        "Academic office correction",
      );
      const after = await detail();
      assert.equal(after.sheet.state, "finalized");
      assert.equal(after.sheet.correction_count, 1);
      assert.equal(after.counts.excused, 1);
      assert.ok(
        after.history.rows.some(
          (e) =>
            e.record_id === id &&
            e.before_data.status === "present" &&
            e.after_data.status === "excused" &&
            e.reason === "Academic office correction",
        ),
      );
      await assert.rejects(
        save(
          old,
          5,
          [{ record_id: id, status: "unmarked" }],
          true,
          "Incomplete correction",
        ),
      );
      await assert.rejects(
        rows(
          "select public.transition_lesson($1,$2,$3,1,'cancelled','Unsafe cancellation')",
          [tenant, old, randomUUID()],
        ),
      );
    },
  );
  await t.test(
    "substitute can mark their assigned lesson; original teacher is read-only there",
    async () => {
      await as(2);
      const d = await detail(subLesson);
      assert.equal(d.can_manage, false);
      await assert.rejects(prepare(subLesson));
      await as(7);
      assert.equal((await detail(subLesson)).can_manage, true);
      await prepare(subLesson);
      await as(1);
    },
  );
  await t.test(
    "other teacher, manager branch, employee, foreign and subjectless restrictions survive edited IDs",
    async () => {
      await as(6);
      await assert.rejects(detail());
      await assert.rejects(prepare());
      assert.ok(!(await workspace()).rows.some((l) => l.id === old));
      assert.equal(
        (
          await rows(
            "select * from public.lesson_attendance_records where lesson_id=$1",
            [old],
          )
        ).length,
        0,
      );
      await as(3);
      await detail();
      await assert.rejects(detail(restricted));
      assert.equal((await workspace({ branch: second })).total, 0);
      await as(4);
      await assert.rejects(detail());
      await assert.rejects(history());
      await as(5);
      await value("select public.create_business('Attendance B') v");
      await assert.rejects(detail());
      await assert.rejects(prepare());
      assert.equal(
        (await rows("select * from public.lesson_attendance_sheets")).length,
        0,
      );
      await as(null);
      await assert.rejects(detail());
      await db.exec("reset role;set role anon");
      await assert.rejects(detail());
      await as(1);
    },
  );
  await t.test(
    "empty roster requires explicit finalization confirmation and adds no artificial absence",
    async () => {
      await prepare(empty);
      assert.equal((await detail(empty)).counts.expected, 0);
      await assert.rejects(finalize(empty, 1));
      await finalize(empty, 1, true);
      assert.equal((await detail(empty)).sheet.state, "finalized");
      assert.equal((await detail(empty)).counts.absent, 0);
    },
  );
  await t.test(
    "roster changes require explicit draft review and retain excluded unmarked rows",
    async () => {
      await prepare(recent);
      const joined = await student("Backdated enrollment reviewed explicitly"),
        newEnrollment = await enroll(joined, await day(-2));
      let d = await detail(recent);
      assert.equal(d.roster_changed, true);
      await assert.rejects(finalize(recent, 1));
      await refresh(recent, 1);
      d = await detail(recent);
      assert.ok(d.rows.some((r) => r.enrollment_id === newEnrollment));
      assert.equal(d.roster_changed, false);
      await rows("select public.update_student_enrollment($1,$2,$3,1,$4)", [
        tenant,
        lateEnrollment,
        randomUUID(),
        {
          status: "withdrawn",
          effective_start_date: await day(-2),
          effective_end_date: await day(-2),
          reason: "Correct effective withdrawal before lesson",
        },
      ]);
      await refresh(recent, 2);
      d = await detail(recent);
      assert.ok(
        d.rows.some(
          (r) =>
            r.customer_id === late && !r.is_expected && r.status === "unmarked",
        ),
      );
      assert.equal(d.counts.excluded, 1);
      assert.ok(d.history.rows.some((e) => e.operation === "roster_refreshed"));
    },
  );
  await t.test(
    "withdrawal and group transfer retain finalized attendance and original enrollment references",
    async () => {
      await rows("select public.update_student_enrollment($1,$2,$3,1,$4)", [
        tenant,
        enrollment,
        randomUUID(),
        {
          status: "withdrawn",
          effective_start_date: start,
          effective_end_date: await day(-4),
          reason: "Withdraw after original lesson",
        },
      ]);
      const d = await detail();
      assert.equal(
        d.rows.find((r) => r.customer_id === pupil).enrollment_id,
        enrollment,
      );
      assert.equal(d.counts.excused, 1);
      assert.equal(
        (await history({ student: pupil, sheet: "finalized" })).rows[0]
          .enrollment_id,
        enrollment,
      );
      const target = await value(
        "select public.transfer_student_enrollment($1,$2,$3,$4,1,$5,$6,'Move pending enrollment') v",
        [
          tenant,
          pendingEnrollment,
          g2,
          randomUUID(),
          today,
          { agreed_price: "700000.10", pricing_model: "monthly" },
        ],
      );
      assert.ok(target);
      assert.equal(
        (await detail()).rows.find((r) => r.customer_id === pupil)
          .enrollment_id,
        enrollment,
      );
    },
  );
  await t.test(
    "cancelled draft sheets remain historical and cannot become regular finalized attendance",
    async () => {
      await rows(
        "select public.transition_lesson($1,$2,$3,1,'cancelled','Cancel retained attendance draft')",
        [tenant, recent, randomUUID()],
      );
      assert.equal((await detail(recent)).can_manage, false);
      await assert.rejects(finalize(recent, 3));
      const h = await history();
      assert.ok(
        h.rows.some(
          (r) => r.lesson_id === recent && r.lesson_status === "cancelled",
        ),
      );
      assert.ok(
        !(await workspace({ view: "awaiting" })).rows.some(
          (l) => l.id === recent,
        ),
      );
    },
  );
  await t.test(
    "historical pause/resume windows use retained audit versions rather than today's status",
    async () => {
      const s = await student("Historical pause interval"),
        e = await enroll(s);
      await db.exec("reset role");
      // Isolated historical fixtures: the same immutable audit snapshots retained by real commands, with past timestamps.
      for (const [version, status, n] of [
        [2, "paused", -15],
        [3, "active", -8],
      ])
        await rows(
          "insert into public.lms_events(tenant_id,branch_id,group_id,enrollment_id,operation,actor_id,actor_name,after_data,created_at) values($1,$2,$3,$4,'enrollment_updated',$5,'Historical actor',$6,($7::date::timestamp at time zone 'Asia/Tashkent'))",
          [tenant, branch, g1, e, uid(1), { version, status }, await day(n)],
        );
      await as(1);
      const during = await lesson(-10),
        before = await lesson(-20),
        after = await lesson(-7);
      assert.ok(!(await detail(during)).rows.some((r) => r.customer_id === s));
      assert.ok((await detail(before)).rows.some((r) => r.customer_id === s));
      assert.ok((await detail(after)).rows.some((r) => r.customer_id === s));
    },
  );
  await t.test(
    "sheet/history pagination and financial independence use real saved records",
    async () => {
      const l = await lesson(-6);
      for (let n = 0; n < 21; n++)
        await enroll(
          await student(`Paged attendance ${String(n).padStart(2, "0")}`),
        );
      await prepare(l);
      const a = await detail(l),
        b = await detail(l, 1);
      assert.ok(a.total > 20);
      assert.equal(a.rows.length, 20);
      assert.ok(b.rows.length > 0);
      assert.ok(!a.rows.some((x) => b.rows.some((y) => x.id === y.id)));
      assert.ok((await history()).total > 20);
      await db.exec("reset role");
      assert.equal(
        (
          await rows(
            "select count(*)::integer n from public.invoice_receivable_entries where tenant_id=$1",
            [tenant],
          )
        )[0].n,
        0,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::integer n from public.financial_ledger_entries where tenant_id=$1",
            [tenant],
          )
        )[0].n,
        0,
      );
      await as(1);
    },
  );
  await t.test(
    "an explicitly granted correction permission authorizes only the actual teaching employee",
    async () => {
      await db.exec("reset role");
      await rows(
        "insert into public.business_role_permissions(tenant_id,role_id,permission) select $1,id,'attendance.correct' from public.business_roles where tenant_id=$1 and system_key='teacher'",
        [tenant],
      );
      await as(2);
      const d = await detail();
      assert.equal(d.can_correct, true);
      await save(
        old,
        d.sheet.version,
        [
          {
            record_id: d.rows.find((r) => r.customer_id === pupil).id,
            status: "absent",
            notes: "Reviewed under explicit grant",
          },
        ],
        true,
        "Explicitly granted teacher correction",
      );
      assert.equal((await detail()).counts.absent, 1);
      await as(6);
      await assert.rejects(detail());
      await as(1);
    },
  );
});
