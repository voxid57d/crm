import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { portableAttendanceFixture } from "./helpers/portable-attendance.mjs";
test("closures, weekly exceptions, restored reservations and retained scheduling history", async (t) => {
  const f = await portableAttendanceFixture(t),
    {
      db,
      rows,
      value,
      as,
      uid,
      tenant,
      branch,
      second,
      day,
      today,
      teacher,
      other,
      g1,
      g2,
      g3,
      lesson,
      future,
      pupil,
    } = f;
  const closure = async (
    b,
    n,
    m = n,
    id = null,
    v = 0,
    extra = {},
    key = randomUUID(),
  ) =>
    value("select public.save_academic_closure($1,$2,$3,$4,$5) v", [
      tenant,
      id,
      key,
      v,
      {
        branch_id: b,
        name: "Non-teaching date",
        reason: "School calendar change",
        from_date: await day(n),
        to_date: await day(m),
        is_active: true,
        ...extra,
      },
    ]);
  const slot = async (g, e, n, m, extra = {}) => {
    const date = await day(n),
      weekday = await value("select extract(isodow from $1::date)::integer v", [
        date,
      ]);
    return value(
      "select public.save_group_schedule($1,$2,null,$3,0,$4,'Weekly calendar fixture') v",
      [
        tenant,
        g,
        randomUUID(),
        {
          weekday: String(weekday),
          start_time: "10:00",
          end_time: "11:00",
          timezone: "Asia/Tashkent",
          effective_from: date,
          effective_to: await day(m),
          teacher_id: e,
          ...extra,
        },
      ],
    );
  };
  const series = async (slot) =>
    value("select series_id v from public.group_schedule_slots where id=$1", [
      slot,
    ]);
  const exception = async (s, n, id = null, v = 0, active = true) =>
    value("select public.save_schedule_exception($1,$2,$3,$4,$5) v", [
      tenant,
      id,
      randomUUID(),
      v,
      {
        series_id: s,
        occurrence_date: await day(n),
        is_active: active,
        reason: "Single occurrence exception",
      },
    ]);
  const generate = async (g, n, m, key = randomUUID()) =>
    value("select public.generate_group_lessons($1,$2,$3,$4,$5) v", [
      tenant,
      g,
      key,
      await day(n),
      await day(m),
    ]);
  const cd = (c) =>
    value("select public.academic_closure_details($1,$2) v", [tenant, c]);
  const change = (l, status = "cancelled", v = 1) =>
    value(
      "select public.transition_lesson($1,$2,$3,$4,$5,'Explicit calendar resolution') v",
      [tenant, l, randomUUID(), v, status],
    );
  const s1 = await slot(g1, teacher, 14, 28),
    lineage = await series(s1);
  let c1, e1, batch;
  await t.test(
    "closure creation is audited, scoped and idempotent without editing pre-existing lessons",
    async () => {
      const before = await value("select public.lesson_details($1,$2) v", [
          tenant,
          future,
        ]),
        key = randomUUID();
      c1 = await closure(branch, 5, 5, null, 0, {}, key);
      assert.equal(await closure(branch, 5, 5, null, 0, {}, key), c1);
      const after = await value("select public.lesson_details($1,$2) v", [
        tenant,
        future,
      ]);
      assert.deepEqual(after, before);
      const impact = await value(
        "select public.closure_lesson_impact($1,$2) v",
        [tenant, c1],
      );
      assert.equal(impact.rows[0].id, future);
      assert.equal(impact.rows[0].can_reschedule, true);
      assert.equal((await cd(c1)).history.total, 1);
      await assert.rejects(lesson(5));
      assert.equal(
        (
          await value("select public.lesson_calendar_context($1,$2) v", [
            tenant,
            future,
          ])
        ).blocked,
        true,
      );
    },
  );
  await t.test(
    "rescheduling out of a closure retains links, teacher/room choices and cancellation metadata",
    async () => {
      const data = (n) => ({
        local_start: n + "T10:00",
        local_end: n + "T11:00",
        timezone: "Asia/Tashkent",
        teacher_id: teacher,
        title: "Explicit one-lesson exception",
      });
      await assert.rejects(
        value(
          "select public.reschedule_lesson($1,$2,$3,1,$4,'Blocked replacement') v",
          [tenant, future, randomUUID(), data(await day(5))],
        ),
      );
      assert.equal(
        (await value("select public.lesson_details($1,$2) v", [tenant, future]))
          .lesson.status,
        "scheduled",
      );
      const moved = await value(
        "select public.reschedule_lesson($1,$2,$3,1,$4,'Move outside closure') v",
        [tenant, future, randomUUID(), data(await day(6))],
      );
      assert.equal(
        (await value("select public.lesson_details($1,$2) v", [tenant, moved]))
          .lesson.rescheduled_from_id,
        future,
      );
      await change(moved);
      const context = await value(
        "select public.lesson_calendar_context($1,$2) v",
        [tenant, moved],
      );
      assert.equal(context.cancellation.previous_status, "scheduled");
      assert.equal(context.cancellation.reason, "Explicit calendar resolution");
      assert.ok(context.cancellation.by);
      assert.ok(context.cancellation.at);
      assert.ok(
        (
          await value("select public.lesson_change_directory($1,$2) v", [
            tenant,
            { from: today, to: today },
          ])
        ).rows.some(
          (r) =>
            r.operation === "lesson_rescheduled_out" && r.lesson_id === future,
        ),
      );
    },
  );
  await t.test(
    "generation distinguishes closure and occurrence skips and never materializes false absences",
    async () => {
      await closure(branch, 14);
      e1 = await exception(lineage, 21);
      const key = randomUUID();
      batch = await generate(g1, 14, 28, key);
      assert.equal(batch.created_count, 1);
      assert.equal(batch.closure_count, 1);
      assert.equal(batch.exception_count, 1);
      assert.deepEqual(await generate(g1, 14, 28, key), batch);
      const skips = await value(
        "select public.generation_skip_directory($1,$2) v",
        [tenant, batch.id],
      );
      assert.equal(skips.total, 2);
      assert.ok(skips.rows.some((s) => s.reason === "closure" && s.closure_id));
      assert.ok(
        skips.rows.some(
          (s) => s.reason === "exception" && s.exception_id === e1,
        ),
      );
      assert.equal(
        (
          await rows(
            "select count(*)::integer n from public.lessons where tenant_id=$1 and series_id=$2",
            [tenant, lineage],
          )
        )[0].n,
        1,
      );
      assert.equal(
        (
          await rows(
            "select count(*)::integer n from public.lesson_attendance_records",
          )
        )[0].n,
        0,
      );
      assert.equal((await generate(g1, 14, 28)).existing_count, 1);
    },
  );
  await t.test(
    "disabling a holiday cannot restore a weekly plan into another branch's booking",
    async () => {
      const s = await slot(g2, other, 35, 49),
        c = await closure(branch, 35);
      assert.ok(s);
      const cross = await lesson(35, g3, other);
      await assert.rejects(
        closure(branch, 35, 35, c, 1, { is_active: false }),
        (e) => e.code === "23P01",
      );
      assert.equal((await cd(c)).closure.is_active, true);
      assert.equal((await cd(c)).closure.version, 1);
      await change(cross);
      await closure(branch, 35, 35, c, 1, { is_active: false });
      assert.equal((await cd(c)).closure.is_active, false);
      assert.equal((await generate(g2, 35, 49)).created_count, 3);
    },
  );
  await t.test(
    "disabled one-off exceptions also revalidate reservations and retain previous skip receipts",
    async () => {
      await rows("select public.set_group_teachers($1,$2,$3,3,$4,$5)", [
        tenant,
        g2,
        randomUUID(),
        [other, teacher],
        other,
      ]);
      const collision = await lesson(21, g2, teacher);
      await assert.rejects(
        exception(lineage, 21, e1, 1, false),
        (e) => e.code === "23P01",
      );
      await change(collision);
      await exception(lineage, 21, e1, 1, false);
      assert.equal((await generate(g1, 21, 21)).created_count, 1);
      assert.equal(
        (
          await value("select public.generation_batch_details($1,$2) v", [
            tenant,
            batch.id,
          ])
        ).exception_count,
        1,
      );
    },
  );
  await t.test(
    "an exception created for an existing occurrence leaves it explicit and never resurrects cancellations",
    async () => {
      const root = (
        await rows(
          "select id from public.lessons where tenant_id=$1 and series_id=$2 and occurrence_date=$3",
          [tenant, lineage, await day(28)],
        )
      )[0].id;
      const e = await exception(lineage, 28);
      assert.equal(
        (
          await value("select public.schedule_exception_directory($1,$2) v", [
            tenant,
            g1,
          ])
        ).rows.find((x) => x.id === e).lesson_id,
        root,
      );
      assert.equal(
        (await value("select public.lesson_details($1,$2) v", [tenant, root]))
          .lesson.status,
        "scheduled",
      );
      await change(root);
      assert.equal((await generate(g1, 28, 28)).created_count, 0);
      await exception(lineage, 28, e, 1, false);
      assert.equal((await generate(g1, 28, 28)).existing_count, 1);
    },
  );
  await t.test(
    "closure timezone boundaries handle overnight lessons and half-open midnight adjacency",
    async () => {
      const c = await closure(null, 60);
      assert.equal((await cd(c)).closure.timezone, "Asia/Tashkent");
      const times = await value(
        "select jsonb_build_object('local_start',to_char((($1::date::timestamp at time zone 'Asia/Tashkent')-interval '1 hour') at time zone 'America/New_York','YYYY-MM-DD\"T\"HH24:MI'),'local_end',to_char(($1::date::timestamp at time zone 'Asia/Tashkent') at time zone 'America/New_York','YYYY-MM-DD\"T\"HH24:MI')) v",
        [await day(60)],
      );
      await lesson(59, g1, teacher, { ...times, timezone: "America/New_York" });
      await assert.rejects(
        lesson(60, g1, teacher, {
          local_start: (await day(59)) + "T23:30",
          local_end: (await day(60)) + "T00:30",
        }),
      );
    },
  );
  await t.test(
    "Teacher and Manager views cannot infer other branch lesson impacts or mutate global closures",
    async () => {
      const otherClosure = await closure(second, 80);
      await as(2);
      assert.equal((await cd(c1)).can_manage, false);
      await assert.rejects(closure(branch, 81));
      await assert.rejects(exception(lineage, 28));
      await assert.rejects(cd(otherClosure));
      await as(3);
      await assert.rejects(closure(null, 81));
      await assert.rejects(closure(second, 81));
      await assert.rejects(cd(otherClosure));
      assert.equal(
        (
          await value("select public.closure_lesson_impact($1,$2) v", [
            tenant,
            c1,
          ])
        ).total,
        0,
      );
      await as(1);
      await rows(
        "select public.assign_member_role($1,$2,(select id from public.business_roles where tenant_id=$1 and system_key='manager'),$3)",
        [tenant, uid(3), [branch, second]],
      );
      await as(3);
      await assert.rejects(closure(null, 82));
      await as(1);
    },
  );
  await t.test(
    "foreign, Employee, anonymous and forged resource IDs cannot bypass calendar authorization",
    async () => {
      await as(4);
      await assert.rejects(cd(c1));
      await assert.rejects(closure(branch, 81));
      await as(5);
      await value("select public.create_business('Calendar B') v");
      await assert.rejects(cd(c1));
      await assert.rejects(generate(g1, 14, 21));
      assert.equal(
        (await rows("select * from public.academic_closures")).length,
        0,
      );
      assert.equal(
        (await rows("select * from public.group_schedule_exceptions")).length,
        0,
      );
      await as(null);
      await assert.rejects(cd(c1));
      await db.exec("reset role;set role anon");
      await assert.rejects(cd(c1));
      await as(1);
      await assert.rejects(closure(randomUUID(), 81));
      await assert.rejects(exception(randomUUID(), 81));
      await assert.rejects(rows("delete from public.academic_closures"));
      await assert.rejects(closure(branch, -1));
    },
  );
  await t.test(
    "pagination, stale edits and calendar/change history are actual authorized records",
    async () => {
      for (let n = 0; n < 21; n++) await closure(branch, 90 + n);
      const d = await value(
        "select public.academic_closure_directory($1,$2) v",
        [tenant, { from: today, to: await day(120), status: "all" }],
      );
      assert.ok(d.total > 20);
      assert.equal(d.rows.length, 20);
      assert.ok(
        (
          await value("select public.academic_closure_directory($1,$2,1) v", [
            tenant,
            { from: today, to: await day(120), status: "all" },
          ])
        ).rows.length > 0,
      );
      await assert.rejects(
        closure(branch, 5, 5, c1, 0),
        (e) => e.code === "40001",
      );
      await assert.rejects(
        closure(branch, -1, -1, c1, 1),
        (e) => e.code === "P0001",
      );
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
      assert.ok(pupil);
    },
  );
  await t.test(
    "restoring a skipped occurrence also protects a classroom occupied by a different teacher",
    async () => {
      const room = await value(
        "select public.save_classroom($1,null,$2,0,$3) v",
        [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            name: "Shared exception classroom",
            capacity: "50",
          },
        ],
      );
      const s = await slot(g2, other, 63, 70, { classroom_id: room }),
        sr = await series(s),
        e = await exception(sr, 63);
      const occupied = await lesson(63, g1, teacher, { classroom_id: room });
      await assert.rejects(
        exception(sr, 63, e, 1, false),
        (x) => x.code === "23P01",
      );
      await change(occupied);
      await exception(sr, 63, e, 1, false);
    },
  );
});
