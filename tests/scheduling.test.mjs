import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
test("weekly schedules, timezone-aware lessons, conflicts, lifecycle and roster privacy", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const rows = async (q, a = []) => (await db.query(q, a)).rows;
  const uid = (n) => `92000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
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
      `schedule${n}@example.test`,
    ]);
  await as(1);
  const tenant = (
      await rows("select public.create_business('Scheduling A') id")
    )[0].id,
    branch = (await rows("select id from public.branches"))[0].id,
    second = (
      await rows(
        "insert into public.branches(tenant_id,name) values($1,'Second teaching branch') returning id",
        [tenant],
      )
    )[0].id;
  const date = async (n) =>
      (
        await rows(
          "select ((now() at time zone 'Asia/Tashkent')::date+$1::integer)::text d",
          [n],
        )
      )[0].d,
    today = await date(0),
    future = await date(7),
    weekly = await date(14),
    next = await date(21),
    revisionDay = await date(28),
    later = await date(35),
    yesterday = await date(-1);
  const course = (
    await rows("select public.save_course($1,null,$2,0,$3) id", [
      tenant,
      randomUUID(),
      {
        name: "Scheduling course",
        standard_price: "750000.10",
        pricing_model: "monthly",
      },
    ])
  )[0].id;
  const room = async (b, name, cap = "4") =>
    (
      await rows("select public.save_classroom($1,null,$2,0,$3) id", [
        tenant,
        randomUUID(),
        { branch_id: b, name, capacity: cap },
      ])
    )[0].id;
  const r1 = await room(branch, "Room 1"),
    r2 = await room(second, "Room 2"),
    r3 = await room(branch, "Alternative room");
  const group = async (name, b = branch, extra = {}) =>
    (
      await rows("select public.save_study_group($1,null,$2,0,$3) id", [
        tenant,
        randomUUID(),
        {
          branch_id: b,
          course_id: course,
          name,
          start_date: await date(-30),
          end_date: await date(365),
          capacity: "4",
          ...extra,
        },
      ])
    )[0].id;
  const g1 = await group("First group"),
    g2 = await group("Other group"),
    g3 = await group("Cross-branch group", second);
  await db.exec("reset role");
  for (const [n, key, branches] of [
    [2, "teacher", [branch, second]],
    [3, "manager", [branch]],
    [4, "employee", [branch]],
    [6, "teacher", [branch, second]],
    [7, "teacher", [branch]],
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
  const employee = async (n, name, branches) => {
    const id = (
      await rows(
        "select public.save_employee($1,null,$2,'',$3,'Teacher','active',$4,'',$5) id",
        [tenant, name, `schedule${n}@example.test`, today, branches],
      )
    )[0].id;
    await db.exec("reset role");
    await rows("update public.employees set user_id=$1 where id=$2", [
      uid(n),
      id,
    ]);
    await as(1);
    return id;
  };
  const teacher = await employee(2, "Primary teacher", [branch, second]),
    other = await employee(6, "Other teacher", [branch, second]),
    sub = await employee(7, "Substitute teacher", [branch]);
  for (const [g, ids, primary] of [
    [g1, [teacher], teacher],
    [g2, [other], other],
    [g3, [teacher, other], teacher],
  ])
    await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
      tenant,
      g,
      randomUUID(),
      ids,
      primary,
    ]);
  await rows(
    "select public.change_group_status($1,$2,$3,2,'active','Start teaching')",
    [tenant, g1, randomUUID()],
  );
  const pupil = (
    await rows("select public.save_student($1,$2,null,$3,$4,$5) id", [
      tenant,
      randomUUID(),
      { first_name: "Original lesson student", phone: "998908881111" },
      { student_identifier: "LESSON-STUDENT" },
      [branch],
    ])
  )[0].id;
  const enrollment = (
    await rows("select public.create_student_enrollment($1,$2,$3,$4,$5) id", [
      tenant,
      g1,
      pupil,
      randomUUID(),
      {
        enrollment_date: today,
        effective_start_date: await date(-20),
        agreed_price: "750000.10",
        pricing_model: "monthly",
        status: "active",
      },
    ])
  )[0].id;
  const lessonData = (
    day = future,
    start = "10:00",
    end = "11:00",
    extra = {},
  ) => ({
    local_start: day + "T" + start,
    local_end: day + "T" + end,
    timezone: "Asia/Tashkent",
    teacher_id: teacher,
    classroom_id: r1,
    title: "English lesson",
    notes: "Academic topic",
    ...extra,
  });
  const save = async (g, data, id = null, v = 0, key = randomUUID()) =>
    (
      await rows("select public.save_lesson($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        g,
        id,
        key,
        v,
        data,
        "Lesson planning",
      ])
    )[0].id;
  const detail = async (id) =>
    (await rows("select public.lesson_details($1,$2) d", [tenant, id]))[0].d;
  const transition = async (id, v, status, key = randomUUID()) =>
    (
      await rows("select public.transition_lesson($1,$2,$3,$4,$5,$6) id", [
        tenant,
        id,
        key,
        v,
        status,
        "Lifecycle reason",
      ])
    )[0].id;
  const wd = (
    await rows("select extract(isodow from $1::date)::integer d", [weekly])
  )[0].d;
  const slotInput = {
    weekday: String(wd),
    start_time: "10:00",
    end_time: "11:00",
    timezone: "Asia/Tashkent",
    effective_from: weekly,
    effective_to: later,
    teacher_id: teacher,
    classroom_id: r1,
  };
  const schedule = async (g, data = {}, id = null, v = 0, key = randomUUID()) =>
    (
      await rows("select public.save_group_schedule($1,$2,$3,$4,$5,$6,$7) id", [
        tenant,
        g,
        id,
        key,
        v,
        { ...slotInput, ...data },
        "Weekly planning",
      ])
    )[0].id;
  const generate = async (
    from = weekly,
    to = next,
    key = randomUUID(),
    g = g1,
  ) =>
    (
      await rows("select public.generate_group_lessons($1,$2,$3,$4,$5) d", [
        tenant,
        g,
        key,
        from,
        to,
      ])
    )[0].d;
  let first, slot, root, nextRoot, replacement, pastLesson, subLesson;
  await t.test(
    "manual lessons use UTC instants and authorized existing resources",
    async () => {
      first = await save(g1, lessonData());
      assert.equal(
        new Date((await detail(first)).lesson.starts_at).toISOString(),
        future + "T05:00:00.000Z",
      );
      await assert.rejects(
        save(g1, lessonData(future, "11:00", "10:00")),
        /start\/end/,
      );
      await assert.rejects(
        save(g1, lessonData(future, "12:00", "13:00", { classroom_id: r2 })),
        /same-branch/,
      );
      await assert.rejects(
        save(g1, lessonData(future, "12:00", "13:00", { teacher_id: sub })),
        /assignment/,
      );
    },
  );
  await t.test(
    "half-open overlaps block group, room and teacher across branches; adjacent and online bookings succeed",
    async () => {
      await assert.rejects(
        save(g1, lessonData(future, "10:30", "11:30", { classroom_id: r3 })),
        /conflict/,
      );
      await assert.rejects(
        save(g2, lessonData(future, "10:00", "11:00", { teacher_id: other })),
        /conflict/,
      );
      await assert.rejects(
        save(g3, lessonData(future, "10:00", "11:00", { classroom_id: r2 })),
        /conflict/,
      );
      await save(g1, lessonData(future, "11:00", "12:00"));
      await save(
        g2,
        lessonData(future, "10:00", "11:00", {
          teacher_id: other,
          classroom_id: "",
        }),
      );
    },
  );
  await t.test(
    "weekly plans reserve real future resources before generation",
    async () => {
      slot = await schedule(g1);
      await assert.rejects(schedule(g3, { classroom_id: r2 }), /conflict/);
      await assert.rejects(schedule(g2, { teacher_id: other }), /conflict/);
      await assert.rejects(
        save(g3, lessonData(weekly, "10:30", "11:30", { classroom_id: r2 })),
        /Schedule conflict/,
      );
      await assert.rejects(
        schedule(g1, { effective_to: await date(380) }),
        /group|year/,
      );
    },
  );
  await t.test(
    "generation is bounded, retry-safe and idempotent per series/local date",
    async () => {
      const key = randomUUID(),
        batch = await generate(weekly, next, key);
      assert.equal(batch.created_count, 2);
      assert.deepEqual(await generate(weekly, next, key), batch);
      const again = await generate();
      assert.equal(again.created_count, 0);
      assert.equal(again.existing_count, 2);
      const list = (
        await rows("select public.lesson_directory($1,$2) d", [
          tenant,
          { group: g1, from: weekly, to: next },
        ])
      )[0].d;
      assert.equal(list.total, 2);
      [root, nextRoot] = list.rows.map((l) => l.id);
      assert.equal((await detail(root)).lesson.occurrence_date, weekly);
      await assert.rejects(generate(weekly, await date(60)), /31 days/);
    },
  );
  await t.test(
    "cancellation/rescheduling preserve roots and generation never recreates them",
    async () => {
      await transition(root, 1, "cancelled");
      await save(g1, lessonData(weekly));
      replacement = (
        await rows("select public.reschedule_lesson($1,$2,$3,1,$4,$5) id", [
          tenant,
          nextRoot,
          randomUUID(),
          lessonData(next, "13:00", "14:00"),
          "Move future teaching",
        ])
      )[0].id;
      assert.equal((await detail(nextRoot)).lesson.status, "rescheduled");
      assert.equal(
        (await detail(replacement)).lesson.rescheduled_from_id,
        nextRoot,
      );
      assert.equal((await generate()).existing_count, 2);
      await assert.rejects(
        save(g1, lessonData(next, "15:00", "16:00"), replacement, 1),
        /rescheduling/,
      );
    },
  );
  await t.test(
    "effective schedule revisions preserve already-generated future lessons and use new periods",
    async () => {
      await generate(later, later);
      const old = (
        await rows("select public.lesson_directory($1,$2) d", [
          tenant,
          { group: g1, from: later, to: later },
        ])
      )[0].d.rows[0];
      const revised = await schedule(
        g1,
        { start_time: "09:00", end_time: "10:00", effective_from: revisionDay },
        slot,
        1,
      );
      assert.notEqual(revised, slot);
      assert.equal((await detail(old.id)).lesson.starts_at, old.starts_at);
      assert.equal((await generate(revisionDay, later)).created_count, 1);
      assert.equal((await detail(old.id)).lesson.schedule_slot_id, slot);
      await assert.rejects(schedule(g1, {}, slot, 1), /changed/);
    },
  );
  await t.test(
    "substitutes replace effective teacher bookings and receive lesson-scoped access",
    async () => {
      const day = await date(8);
      subLesson = await save(
        g2,
        lessonData(day, "10:00", "11:00", {
          teacher_id: other,
          substitute_id: sub,
          classroom_id: "",
        }),
      );
      await save(
        g3,
        lessonData(day, "10:00", "11:00", {
          teacher_id: other,
          classroom_id: r2,
        }),
      );
      await assert.rejects(
        save(
          g1,
          lessonData(day, "10:00", "11:00", {
            substitute_id: sub,
            classroom_id: r3,
          }),
        ),
        /conflict/,
      );
      await as(7);
      assert.equal((await detail(subLesson)).lesson.group_id, g2);
      await assert.rejects(
        rows("select public.study_group_details($1,$2)", [tenant, g2]),
        /denied/,
      );
      assert.equal((await detail(subLesson)).can_manage, false);
      await as(1);
    },
  );
  await t.test(
    "completed lessons and captured expected enrollment identities survive later enrollment changes",
    async () => {
      pastLesson = await save(g1, lessonData(yesterday));
      assert.equal(
        (
          await rows("select public.lesson_expected_roster($1,$2) d", [
            tenant,
            pastLesson,
          ])
        )[0].d.rows[0].customer_id,
        pupil,
      );
      await transition(pastLesson, 1, "in_progress");
      await transition(pastLesson, 2, "completed");
      const before = await detail(pastLesson);
      await rows("select public.update_student_enrollment($1,$2,$3,1,$4)", [
        tenant,
        enrollment,
        randomUUID(),
        {
          status: "withdrawn",
          effective_start_date: await date(-20),
          effective_end_date: today,
          reason: "Retain past expected roster",
        },
      ]);
      const roster = (
        await rows("select public.lesson_expected_roster($1,$2) d", [
          tenant,
          pastLesson,
        ])
      )[0].d;
      assert.ok(roster.captured_at);
      assert.equal(roster.rows[0].enrollment_id, enrollment);
      assert.equal(roster.rows[0].customer_id, pupil);
      await assert.rejects(
        save(g1, lessonData(yesterday), pastLesson, 3),
        /terminal/,
      );
      await assert.rejects(transition(pastLesson, 3, "cancelled"), /terminal/);
      assert.deepEqual(await detail(pastLesson), before);
    },
  );
  await t.test(
    "DST conversion preserves local intent and rejects missing/ambiguous wall clocks",
    async () => {
      const year = Number(today.slice(0, 4)) + 1,
        start = `${year}-03-01`,
        end = `${year}-03-21`,
        dstGroup = await group("DST group", second, {
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
        });
      await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
        tenant,
        dstGroup,
        randomUUID(),
        [other],
        other,
      ]);
      await schedule(dstGroup, {
        weekday: "7",
        start_time: "03:30",
        end_time: "04:30",
        timezone: "America/New_York",
        effective_from: start,
        effective_to: end,
        teacher_id: other,
        classroom_id: r2,
      });
      await generate(start, end, randomUUID(), dstGroup);
      const list = (
        await rows("select public.lesson_directory($1,$2) d", [
          tenant,
          { group: dstGroup, from: start, to: end },
        ])
      )[0].d.rows;
      assert.equal(list.length, 3);
      assert.equal(new Date(list[0].starts_at).getUTCHours(), 8);
      assert.equal(new Date(list[2].starts_at).getUTCHours(), 7);
      await assert.rejects(
        schedule(dstGroup, {
          weekday: "7",
          start_time: "02:30",
          end_time: "03:15",
          timezone: "America/New_York",
          effective_from: start,
          effective_to: end,
          teacher_id: other,
          classroom_id: r2,
        }),
        /nonexistent/,
      );
      await assert.rejects(
        save(dstGroup, {
          ...lessonData(
            (() => {
              const d = new Date(Date.UTC(year, 10, 1));
              d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7));
              return d.toISOString().slice(0, 10);
            })(),
            "01:30",
            "02:30",
            {
              teacher_id: other,
              classroom_id: r2,
              timezone: "America/New_York",
            },
          ),
        }),
        /Ambiguous|nonexistent/,
      );
    },
  );
  await t.test(
    "only the actual teaching employee can complete a lesson without management permission",
    async () => {
      await rows("select public.set_group_teachers($1,$2,$3,3,$4,$5)", [
        tenant,
        g1,
        randomUUID(),
        [teacher, other],
        teacher,
      ]);
      const otherLesson = await save(
        g1,
        lessonData(await date(-2), "10:00", "11:00", { teacher_id: other }),
      );
      await as(2);
      assert.equal((await detail(otherLesson)).can_complete, false);
      await assert.rejects(transition(otherLesson, 1, "completed"), /denied/);
      await as(6);
      assert.equal((await detail(otherLesson)).can_complete, true);
      await transition(otherLesson, 1, "completed");
      await as(1);
    },
  );
  await t.test(
    "group closure, alternate-room capacity and weekly period guards retain scheduled resource integrity",
    async () => {
      const guard = await group("Guard group");
      await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
        tenant,
        guard,
        randomUUID(),
        [other],
        other,
      ]);
      const slot = await schedule(guard, {
          effective_from: await date(70),
          effective_to: await date(77),
          teacher_id: other,
          classroom_id: r3,
          start_time: "16:00",
          end_time: "17:00",
        }),
        lesson = await save(
          guard,
          lessonData(await date(65), "16:00", "17:00", {
            teacher_id: other,
            classroom_id: r3,
          }),
        );
      await assert.rejects(
        rows("select public.save_classroom($1,$2,$3,1,$4)", [
          tenant,
          r3,
          randomUUID(),
          { branch_id: branch, name: "Alternative room", capacity: "3" },
        ]),
        /capacity/,
      );
      await assert.rejects(
        rows("select public.save_study_group($1,$2,$3,2,$4)", [
          tenant,
          guard,
          randomUUID(),
          {
            branch_id: branch,
            course_id: course,
            name: "Guard group",
            start_date: await date(-30),
            end_date: await date(365),
            capacity: "5",
          },
        ]),
        /classroom/,
      );
      await assert.rejects(
        rows(
          "select public.change_group_status($1,$2,$3,2,'cancelled','Close teaching')",
          [tenant, guard, randomUUID()],
        ),
        /Finish or cancel/,
      );
      await transition(lesson, 1, "cancelled");
      await assert.rejects(
        rows(
          "select public.change_group_status($1,$2,$3,2,'cancelled','Close teaching')",
          [tenant, guard, randomUUID()],
        ),
        /End current\/future/,
      );
      await rows("select public.end_group_schedule($1,$2,$3,1,$4,$5)", [
        tenant,
        slot,
        randomUUID(),
        today,
        "End planned teaching",
      ]);
      await rows(
        "select public.change_group_status($1,$2,$3,2,'cancelled','Close teaching')",
        [tenant, guard, randomUUID()],
      );
    },
  );
  await t.test(
    "lesson pagination, literal filters and midnight-spanning calendar queries count actual authorized rows",
    async () => {
      for (let n = 100; n < 122; n++)
        await save(
          g1,
          lessonData(await date(n), "10:00", "11:00", {
            title: "Paged lesson " + n,
          }),
        );
      const filter = {
          group: g1,
          from: await date(100),
          to: await date(122),
          q: "Paged lesson",
        },
        list = (
          await rows("select public.lesson_directory($1,$2,1) d", [
            tenant,
            filter,
          ])
        )[0].d;
      assert.equal(list.total, 22);
      assert.equal(list.rows.length, 2);
      assert.equal(list.rows[0].title, "Paged lesson 120");
      assert.equal(
        (
          await rows("select public.lesson_directory($1,$2,0,true) d", [
            tenant,
            filter,
          ])
        )[0].d.rows.length,
        22,
      );
      assert.equal(
        (
          await rows("select public.lesson_directory($1,$2) d", [
            tenant,
            { ...filter, q: "%" },
          ])
        )[0].d.total,
        0,
      );
      const night = await save(
        g1,
        lessonData(await date(50), "23:30", "23:59", {
          local_end: (await date(51)) + "T00:30",
        }),
      );
      await save(
        g2,
        lessonData(await date(50), "22:00", "23:59", {
          teacher_id: other,
          classroom_id: "",
          local_end: (await date(51)) + "T00:00",
        }),
      );
      const nextDay = (
        await rows("select public.lesson_directory($1,$2,0,true) d", [
          tenant,
          { from: await date(51), to: await date(51) },
        ])
      )[0].d;
      assert.deepEqual(
        nextDay.rows.map((l) => l.id),
        [night],
      );
      await as(2);
      assert.equal(
        (
          await rows("select public.lesson_directory($1,$2) d", [
            tenant,
            { ...filter, teacher: "me" },
          ])
        )[0].d.total,
        22,
      );
      await as(3);
      assert.equal(
        (
          await rows("select public.lesson_directory($1,$2) d", [
            tenant,
            { ...filter, branch: second },
          ])
        )[0].d.total,
        0,
      );
      await as(1);
    },
  );
  await t.test(
    "Teacher and Manager boundaries, raw DML, finance and unauthenticated reads stay protected",
    async () => {
      await as(2);
      assert.equal((await detail(first)).lesson.id, first);
      await assert.rejects(
        rows("select public.save_lesson($1,$2,null,$3,0,$4,$5)", [
          tenant,
          g1,
          randomUUID(),
          lessonData(await date(11)),
          "Unauthorized",
        ]),
        /denied/,
      );
      await assert.rejects(transition(subLesson, 1, "cancelled"), /denied/);
      await assert.rejects(
        rows("select public.financial_report($1,'payments')", [tenant]),
        /denied/,
      );
      await assert.rejects(
        rows("select * from public.lesson_expected_students"),
        /permission denied/,
      );
      await as(3);
      const hidden = await save(g1, lessonData(await date(12)));
      assert.equal((await detail(hidden)).lesson.branch_id, branch);
      await assert.rejects(
        rows("select public.scheduling_options($1,$2)", [tenant, g3]),
        /denied/,
      );
      await as(4);
      await assert.rejects(detail(first), /denied/);
      await as(5);
      await rows("select public.create_business('Scheduling B')");
      await assert.rejects(detail(first), /denied/);
      assert.equal(
        (await rows("select count(*) n from public.lessons"))[0].n,
        0,
      );
      await as(0);
      await assert.rejects(detail(first), /denied/);
      await as(1);
      await assert.rejects(
        rows("delete from public.lessons"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "failed multi-slot generation rolls back earlier inserts, audit and request receipt",
    async () => {
      const g = await group("Atomic generation group");
      await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
        tenant,
        g,
        randomUUID(),
        [teacher, other],
        teacher,
      ]);
      await schedule(g, {
        effective_from: await date(150),
        effective_to: await date(157),
        teacher_id: teacher,
        start_time: "10:00",
        end_time: "11:00",
      });
      await schedule(g, {
        effective_from: await date(150),
        effective_to: await date(157),
        teacher_id: other,
        start_time: "11:00",
        end_time: "12:00",
      });
      await rows("select public.archive_employee($1,$2)", [tenant, other]);
      const key = randomUUID();
      await assert.rejects(
        generate(await date(150), await date(157), key, g),
        /eligible assignment/,
      );
      assert.equal(
        (
          await rows("select public.lesson_directory($1,$2) d", [
            tenant,
            { group: g, from: await date(150), to: await date(157) },
          ])
        )[0].d.total,
        0,
      );
      await db.exec("reset role");
      assert.equal(
        (
          await rows(
            "select count(*) n from public.lms_commands where tenant_id=$1 and request_id=$2",
            [tenant, key],
          )
        )[0].n,
        0,
      );
      assert.equal(
        (
          await rows(
            "select count(*) n from public.scheduling_events where tenant_id=$1 and group_id=$2 and lesson_id is not null",
            [tenant, g],
          )
        )[0].n,
        0,
      );
      await as(1);
    },
  );
});
