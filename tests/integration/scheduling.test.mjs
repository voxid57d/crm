import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
import { addDays } from "../../src/features/academics/calendar.mjs";
test("local weekly scheduling, lesson forms, calendar, rosters and concurrent booking protection", async (t) => {
  const owner = await localAccount("schedule-owner"),
    foreignUser = await localAccount("schedule-foreign"),
    teacher = await localAccount("schedule-teacher"),
    otherTeacher = await localAccount("schedule-other-teacher"),
    substitute = await localAccount("schedule-substitute"),
    manager = await localAccount("schedule-manager"),
    employee = await localAccount("schedule-employee");
  const tenant = await rpc(owner, "create_business", {
      p_name: "Live scheduling " + randomUUID().slice(0, 8),
    }),
    foreign = await rpc(foreignUser, "create_business", {
      p_name: "Other scheduling business",
    }),
    branch = (
      await owner.client
        .from("branches")
        .select("id")
        .eq("tenant_id", tenant)
        .single()
    ).data.id;
  const secondResult = await owner.client
    .from("branches")
    .insert({ tenant_id: tenant, name: "Other teaching branch" })
    .select("id")
    .single();
  assert.ifError(secondResult.error);
  const second = secondResult.data.id;
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    day = (n) => addDays(today, n),
    app = renderedApp(owner, tenant, branch),
    teacherApp = renderedApp(teacher, tenant, branch),
    subApp = renderedApp(substitute, tenant, branch),
    managerApp = renderedApp(manager, tenant, branch);
  const roles = await owner.client
    .from("business_roles")
    .select("id,system_key")
    .eq("tenant_id", tenant);
  assert.ifError(roles.error);
  const role = (key) => roles.data.find((r) => r.system_key === key).id;
  const link = async (account, name, branches) => {
    const id = await rpc(owner, "save_employee", {
        p_tenant: tenant,
        p_id: null,
        p_full_name: name,
        p_phone: "",
        p_email: account.email,
        p_job_title: "Teacher",
        p_status: "active",
        p_start_date: day(-7),
        p_notes: "",
        p_branches: branches,
      }),
      token = await rpc(owner, "create_employee_invitation", {
        p_tenant: tenant,
        p_employee: id,
        p_role: role("teacher"),
      });
    await rpc(account, "accept_employee_invitation", { p_token: token });
    return id;
  };
  const t1 = await link(teacher, "Live primary instructor", [branch, second]),
    t2 = await link(otherTeacher, "Live additional instructor", [
      branch,
      second,
    ]),
    sub = await link(substitute, "Live substitute instructor", [branch]);
  await rpc(owner, "assign_member_role", {
    p_tenant: tenant,
    p_user: manager.id,
    p_role: role("manager"),
    p_branches: [branch],
  });
  await rpc(owner, "assign_member_role", {
    p_tenant: tenant,
    p_user: employee.id,
    p_role: role("employee"),
    p_branches: [branch],
  });
  const course = await rpc(owner, "save_course", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_version: 0,
    p_data: {
      name: "Live scheduling course",
      standard_price: "750000.10",
      pricing_model: "monthly",
    },
  });
  const room = async (b, name) =>
      rpc(owner, "save_classroom", {
        p_tenant: tenant,
        p_id: null,
        p_request: randomUUID(),
        p_version: 0,
        p_data: { branch_id: b, name, capacity: "3" },
      }),
    r1 = await room(branch, "Live room A"),
    r2 = await room(second, "Hidden branch room"),
    r3 = await room(branch, "Live alternative room");
  const makeGroup = async (name, b, teachers, extra = {}) => {
    const id = await rpc(owner, "save_study_group", {
      p_tenant: tenant,
      p_id: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: {
        branch_id: b,
        course_id: course,
        name,
        start_date: day(-7),
        end_date: day(90),
        capacity: "2",
        ...extra,
      },
    });
    await rpc(owner, "set_group_teachers", {
      p_tenant: tenant,
      p_group: id,
      p_request: randomUUID(),
      p_version: 1,
      p_employees: teachers,
      p_primary: teachers[0],
      p_reason: "Teaching team",
    });
    await rpc(owner, "change_group_status", {
      p_tenant: tenant,
      p_group: id,
      p_request: randomUUID(),
      p_version: 2,
      p_status: "active",
      p_reason: "Start teaching",
    });
    return id;
  };
  const group = await makeGroup("Live scheduled group", branch, [t1, t2]),
    otherGroup = await makeGroup("Live other group", branch, [t2]),
    hiddenGroup = await makeGroup("Hidden teaching group", second, [t1]);
  const student = await rpc(owner, "save_student", {
      p_tenant: tenant,
      p_request: randomUUID(),
      p_customer: null,
      p_profile: {
        first_name: "Original scheduled student",
        phone: "998908881111",
      },
      p_student: {},
      p_branches: [branch],
    }),
    enrollment = await rpc(owner, "create_student_enrollment", {
      p_tenant: tenant,
      p_group: group,
      p_student: student,
      p_request: randomUUID(),
      p_data: {
        enrollment_date: today,
        effective_start_date: day(-7),
        status: "active",
        agreed_price: "750000.10",
        pricing_model: "monthly",
        notes: "Confidential enrollment agreement note",
      },
    });
  const invoice = await rpc(owner, "save_invoice_draft", {
    p_tenant: tenant,
    p_invoice: null,
    p_request: randomUUID(),
    p_version: 0,
    p_data: {
      branch_id: branch,
      customer_id: student,
      issue_date: today,
      due_date: today,
      discount_amount: "0",
    },
    p_items: [
      {
        description: "Sensitive existing tuition invoice",
        quantity: "1",
        unit_price: "100",
        discount_amount: "0",
      },
    ],
  });
  await rpc(owner, "transition_invoice", {
    p_tenant: tenant,
    p_invoice: invoice,
    p_request: randomUUID(),
    p_version: 1,
    p_action: "issue",
  });
  const box = await rpc(owner, "save_cashbox", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_data: {
      branch_id: branch,
      name: "Unchanged scheduling cashbox",
      cashbox_type: "cash",
    },
  });
  await rpc(owner, "post_payment", {
    p_tenant: tenant,
    p_request: randomUUID(),
    p_data: {
      branch_id: branch,
      customer_id: student,
      cashbox_id: box,
      amount: "60.10",
      paid_at: today + "T00:00:00+05:00",
      method: "cash",
    },
    p_allocations: [{ invoice_id: invoice, amount: "40" }],
  });
  const financeBefore = await rpc(owner, "customer_financial_profile", {
    p_tenant: tenant,
    p_customer: student,
  });
  const ld = (id) =>
      rpc(owner, "lesson_details", { p_tenant: tenant, p_lesson: id }),
    slotDetail = (id) =>
      rpc(owner, "group_schedule_details", { p_tenant: tenant, p_slot: id }),
    success = (r) => assert.equal(r.response.status, 303, r.html.slice(0, 600));
  const lessonData = (n, start = "14:00", end = "15:00", extra = {}) => ({
    group_id: group,
    local_start: day(n) + "T" + start,
    local_end: day(n) + "T" + end,
    timezone: "Asia/Tashkent",
    teacher_id: t1,
    substitute_id: "",
    classroom_id: r1,
    title: "Live individual lesson",
    notes: "Safe academic notes",
    reason: "Lesson planning",
    ...extra,
  });
  const directLesson = (g, data) =>
    owner.client.rpc("save_lesson", {
      p_tenant: tenant,
      p_group: g,
      p_id: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: data,
      p_reason: "Concurrent planning",
    });
  const wd = ((new Date(day(7) + "T00:00:00Z").getUTCDay() + 6) % 7) + 1,
    slotData = {
      weekday: String(wd),
      start_time: "10:00",
      end_time: "11:00",
      timezone: "Asia/Tashkent",
      effective_from: day(7),
      effective_to: day(28),
      teacher_id: t1,
      classroom_id: r1,
      reason: "Weekly teaching plan",
    };
  let slot,
    manual,
    root,
    nextRoot,
    rescheduled,
    revised,
    past,
    otherPast,
    subLesson;
  await t.test(
    "weekly slot form saves real local-time resources and prevents ungenerated conflicts",
    async () => {
      const created = await app.post(
        `/groups/${group}/schedules/new`,
        "Create weekly slot",
        slotData,
      );
      success(created);
      slot = /schedules\/([0-9a-f-]{36})/.exec(
        created.response.headers.get("location"),
      )[1];
      assert.equal((await slotDetail(slot)).slot.timezone, "Asia/Tashkent");
      const conflict = await app.post(
        `/lessons/new?group=${hiddenGroup}`,
        "Create lesson",
        lessonData(7, "10:30", "11:30", {
          group_id: hiddenGroup,
          classroom_id: r2,
        }),
      );
      assert.equal(conflict.response.status, 200);
      assert.ok(conflict.html.includes("Scheduling conflict"));
      assert.equal(
        (
          await rpc(owner, "lesson_directory", {
            p_tenant: tenant,
            p_filters: { group: hiddenGroup, from: day(7), to: day(7) },
          })
        ).total,
        0,
      );
    },
  );
  await t.test(
    "generation form and exact request replay create two lessons without duplicates",
    async () => {
      const key = randomUUID(),
        created = await app.post(
          `/groups/${group}/schedules`,
          "Generate lessons",
          { from: day(7), to: day(14), request_id: key },
        );
      success(created);
      const batchId = new URL(
          created.response.headers.get("location"),
          "http://127.0.0.1:3000",
        ).searchParams.get("batch"),
        batch = await rpc(owner, "generation_batch_details", {
          p_tenant: tenant,
          p_batch: batchId,
        });
      assert.equal(batch.created_count, 2);
      assert.equal(
        (
          await rpc(owner, "generate_group_lessons", {
            p_tenant: tenant,
            p_group: group,
            p_request: key,
            p_from: day(7),
            p_to: day(14),
          })
        ).id,
        batchId,
      );
      const again = await rpc(owner, "generate_group_lessons", {
        p_tenant: tenant,
        p_group: group,
        p_request: randomUUID(),
        p_from: day(7),
        p_to: day(14),
      });
      assert.equal(again.created_count, 0);
      assert.equal(again.existing_count, 2);
      const list = await rpc(owner, "lesson_directory", {
        p_tenant: tenant,
        p_filters: { group, from: day(7), to: day(14) },
      });
      [root, nextRoot] = list.rows.map((l) => l.id);
      assert.equal(list.total, 2);
      assert.equal(
        new Date((await ld(root)).lesson.starts_at).toISOString(),
        day(7) + "T05:00:00.000Z",
      );
      assert.ok(
        (
          await app.get(`/groups/${group}/schedules?batch=${batchId}`)
        ).html.includes("Lesson generation complete"),
      );
    },
  );
  await t.test(
    "individual create/edit forms persist substitutions and room changes while rejecting stale/time edits",
    async () => {
      const created = await app.post(
        `/lessons/new?group=${group}`,
        "Create lesson",
        lessonData(1),
      );
      success(created);
      manual = /lessons\/([0-9a-f-]{36})/.exec(
        created.response.headers.get("location"),
      )[1];
      success(
        await app.post(
          `/lessons/${manual}/edit`,
          "Save lesson details",
          lessonData(1, "14:00", "15:00", {
            substitute_id: sub,
            classroom_id: r3,
            title: "Updated live lesson",
          }),
        ),
      );
      assert.equal((await ld(manual)).lesson.effective_teacher_id, sub);
      const stale = await app.post(
        `/lessons/${manual}/edit`,
        "Save lesson details",
        { ...lessonData(1), version: "1" },
      );
      assert.equal(stale.response.status, 200);
      assert.ok(stale.html.includes("This record changed"));
      const moved = await app.post(
        `/lessons/${manual}/edit`,
        "Save lesson details",
        lessonData(1, "15:00", "16:00"),
      );
      assert.equal(moved.response.status, 200);
      assert.ok(moved.html.includes("Use rescheduling"));
      assert.equal((await ld(manual)).lesson.title, "Updated live lesson");
    },
  );
  await t.test(
    "day/week/month timetable filters and classroom/group links render real lesson events",
    async () => {
      for (const view of ["day", "week", "month"]) {
        const r = await app.get(
          `/timetable?date=${day(7)}&view=${view}&group=${group}&teacher=${t1}&classroom=${r1}&status=scheduled`,
        );
        assert.equal(r.response.status, 200);
        assert.ok(r.html.includes(`/lessons/${root}`));
        assert.ok(r.html.includes("Live scheduled group"));
        assert.ok(r.html.includes("Asia/Tashkent"));
      }
      const absent = await app.get(
        `/timetable?date=${day(7)}&view=day&group=${hiddenGroup}`,
      );
      assert.ok(!absent.html.includes(`/lessons/${root}`));
      assert.ok(
        (await app.get(`/classrooms/${r1}`)).html.includes(
          "View classroom timetable",
        ),
      );
      assert.ok(
        (await app.get(`/groups/${group}`)).html.includes("Weekly schedules"),
      );
    },
  );
  await t.test(
    "failed rescheduling rolls back; successful replacement and cancellation never regenerate originals",
    async () => {
      const before = await ld(nextRoot),
        failure = await app.post(
          `/lessons/${nextRoot}/reschedule`,
          "Reschedule lesson",
          lessonData(1, "14:00", "15:00", {
            classroom_id: r3,
            substitute_id: sub,
          }),
        );
      assert.equal(failure.response.status, 200);
      assert.ok(failure.html.includes("Scheduling conflict"));
      assert.deepEqual(await ld(nextRoot), before);
      const result = await app.post(
        `/lessons/${nextRoot}/reschedule`,
        "Reschedule lesson",
        lessonData(14, "13:00", "14:00"),
      );
      success(result);
      rescheduled = /lessons\/([0-9a-f-]{36})/.exec(
        result.response.headers.get("location"),
      )[1];
      assert.equal(
        (await ld(rescheduled)).lesson.rescheduled_from_id,
        nextRoot,
      );
      assert.equal((await ld(nextRoot)).lesson.status, "rescheduled");
      success(
        await app.post(`/lessons/${root}`, "Change lesson status", {
          status: "cancelled",
          reason: "Cancelled teaching day",
          confirm: "on",
        }),
      );
      const repeat = await rpc(owner, "generate_group_lessons", {
        p_tenant: tenant,
        p_group: group,
        p_request: randomUUID(),
        p_from: day(7),
        p_to: day(14),
      });
      assert.equal(repeat.created_count, 0);
      assert.equal(repeat.existing_count, 2);
    },
  );
  await t.test(
    "weekly revision/end forms preserve generated future lessons and explicit history",
    async () => {
      await rpc(owner, "generate_group_lessons", {
        p_tenant: tenant,
        p_group: group,
        p_request: randomUUID(),
        p_from: day(21),
        p_to: day(21),
      });
      const old = (
        await rpc(owner, "lesson_directory", {
          p_tenant: tenant,
          p_filters: { group, from: day(21), to: day(21) },
        })
      ).rows[0];
      const result = await app.post(
        `/groups/${group}/schedules/${slot}`,
        "Create schedule revision",
        {
          ...slotData,
          start_time: "09:00",
          end_time: "10:00",
          effective_from: day(14),
          reason: "Change future weekly time",
        },
      );
      success(result);
      revised = /schedules\/([0-9a-f-]{36})/.exec(
        result.response.headers.get("location"),
      )[1];
      assert.notEqual(revised, slot);
      assert.equal((await ld(old.id)).lesson.starts_at, old.starts_at);
      const batch = await rpc(owner, "generate_group_lessons", {
        p_tenant: tenant,
        p_group: group,
        p_request: randomUUID(),
        p_from: day(14),
        p_to: day(28),
      });
      assert.equal(batch.created_count, 1);
      assert.equal(batch.existing_count, 2);
      success(
        await app.post(
          `/groups/${group}/schedules/${revised}`,
          "End weekly schedule",
          {
            stop_from: day(28),
            reason: "Finish current weekly planning",
            confirm: "on",
          },
        ),
      );
      assert.equal((await ld(old.id)).lesson.starts_at, old.starts_at);
    },
  );
  await t.test(
    "past lesson lifecycle forms freeze original enrollment IDs and block another teacher from completing it",
    async () => {
      let r = await app.post(
        `/lessons/new?group=${group}`,
        "Create lesson",
        lessonData(-1, "10:00", "11:00", {
          title: "Past expected roster lesson",
        }),
      );
      success(r);
      past = /lessons\/([0-9a-f-]{36})/.exec(
        r.response.headers.get("location"),
      )[1];
      r = await app.post(
        `/lessons/new?group=${group}`,
        "Create lesson",
        lessonData(-2, "10:00", "11:00", {
          title: "Other instructor past lesson",
          teacher_id: t2,
        }),
      );
      success(r);
      otherPast = /lessons\/([0-9a-f-]{36})/.exec(
        r.response.headers.get("location"),
      )[1];
      const forged = await teacherApp.post(
        `/lessons/${past}`,
        "Change lesson status",
        {
          lesson_id: otherPast,
          status: "completed",
          reason: "Forged teaching identity",
          confirm: "on",
        },
      );
      assert.equal(forged.response.status, 200);
      assert.equal((await ld(otherPast)).lesson.status, "scheduled");
      success(
        await teacherApp.post(`/lessons/${past}`, "Change lesson status", {
          status: "in_progress",
          reason: "Start the recorded lesson",
          confirm: "on",
        }),
      );
      success(
        await teacherApp.post(`/lessons/${past}`, "Change lesson status", {
          status: "completed",
          reason: "Complete the recorded lesson",
          confirm: "on",
        }),
      );
      await rpc(owner, "update_student_enrollment", {
        p_tenant: tenant,
        p_enrollment: enrollment,
        p_request: randomUUID(),
        p_version: 1,
        p_data: {
          status: "withdrawn",
          effective_start_date: day(-7),
          effective_end_date: today,
          reason: "Preserve expected teaching history",
        },
      });
      const roster = await rpc(owner, "lesson_expected_roster", {
        p_tenant: tenant,
        p_lesson: past,
      });
      assert.equal(roster.rows[0].customer_id, student);
      assert.equal(roster.rows[0].enrollment_id, enrollment);
      assert.ok(roster.captured_at);
      assert.equal((await ld(past)).lesson.status, "completed");
      const page = await teacherApp.get(`/lessons/${past}`);
      assert.ok(page.html.includes("Original scheduled student"));
      assert.ok(!page.html.includes("Confidential enrollment agreement note"));
      assert.ok(!page.html.includes("Sensitive existing tuition invoice"));
      assert.ok(!page.html.includes("Edit lesson details"));
    },
  );
  await t.test(
    "concurrent room, group and cross-branch teacher bookings each allow one winner",
    async () => {
      for (const [date, a, b] of [
        [
          2,
          { g: group, teacher: t1, room: r1 },
          { g: otherGroup, teacher: t2, room: r1 },
        ],
        [
          3,
          { g: group, teacher: t1, room: r1 },
          { g: hiddenGroup, teacher: t1, room: r2 },
        ],
        [
          4,
          { g: group, teacher: t1, room: r1 },
          { g: group, teacher: t2, room: r3 },
        ],
      ]) {
        const results = await Promise.all(
          [a, b].map((x) =>
            directLesson(
              x.g,
              lessonData(date, "14:00", "15:00", {
                teacher_id: x.teacher,
                classroom_id: x.room,
              }),
            ),
          ),
        );
        assert.equal(results.filter((r) => !r.error).length, 1);
        assert.equal(results.find((r) => r.error).error.code, "23P01");
      }
      const extra = await makeGroup("Concurrent generation group", branch, [
        t2,
      ]);
      await rpc(owner, "save_group_schedule", {
        p_tenant: tenant,
        p_group: extra,
        p_id: null,
        p_request: randomUUID(),
        p_version: 0,
        p_data: {
          ...slotData,
          effective_from: day(35),
          effective_to: day(42),
          teacher_id: t2,
          classroom_id: r3,
        },
        p_reason: "Concurrent recurring generation",
      });
      const batches = await Promise.all(
        [1, 2].map(() =>
          owner.client.rpc("generate_group_lessons", {
            p_tenant: tenant,
            p_group: extra,
            p_request: randomUUID(),
            p_from: day(35),
            p_to: day(42),
          }),
        ),
      );
      batches.forEach((r) => assert.ifError(r.error));
      const weeklyRaces = await Promise.all(
        [
          [group, t1],
          [otherGroup, t2],
        ].map(([g, teacher]) =>
          owner.client.rpc("save_group_schedule", {
            p_tenant: tenant,
            p_group: g,
            p_id: null,
            p_request: randomUUID(),
            p_version: 0,
            p_data: {
              ...slotData,
              effective_from: day(49),
              effective_to: day(56),
              start_time: "09:00",
              end_time: "10:00",
              teacher_id: teacher,
            },
            p_reason: "Competing weekly room reservations",
          }),
        ),
      );
      assert.equal(weeklyRaces.filter((r) => !r.error).length, 1);
      assert.equal(weeklyRaces.find((r) => r.error).error.code, "23P01");
      assert.deepEqual(batches.map((r) => r.data.created_count).sort(), [0, 2]);
      assert.equal(
        (
          await rpc(owner, "lesson_directory", {
            p_tenant: tenant,
            p_filters: { group: extra, from: day(35), to: day(42) },
          })
        ).total,
        2,
      );
    },
  );
  await t.test(
    "one-off substitutes see their own lesson and minimal expected roster without full group/finance access",
    async () => {
      const secondStudent = await rpc(owner, "save_student", {
        p_tenant: tenant,
        p_request: randomUUID(),
        p_customer: null,
        p_profile: {
          first_name: "Substitute group student",
          phone: "998908881112",
        },
        p_student: {},
        p_branches: [branch],
      });
      await rpc(owner, "create_student_enrollment", {
        p_tenant: tenant,
        p_group: otherGroup,
        p_student: secondStudent,
        p_request: randomUUID(),
        p_data: {
          enrollment_date: today,
          effective_start_date: today,
          status: "active",
          agreed_price: "9007199254740993.01",
          pricing_model: "monthly",
          notes: "Substitute must not read this agreement",
        },
      });
      const created = await directLesson(
        otherGroup,
        lessonData(5, "14:00", "15:00", {
          teacher_id: t2,
          substitute_id: sub,
          classroom_id: "",
          title: "Substitute only lesson",
        }),
      );
      assert.ifError(created.error);
      subLesson = created.data;
      const page = await subApp.get(`/lessons/${subLesson}`);
      assert.equal(page.response.status, 200);
      assert.ok(page.html.includes("Substitute group student"));
      assert.ok(!page.html.includes("9007199254740993.01"));
      assert.ok(!page.html.includes("Substitute must not read this agreement"));
      assert.ok(!page.html.includes("Group and enrollments"));
      assert.equal(
        (
          await substitute.client.rpc("study_group_details", {
            p_tenant: tenant,
            p_group: otherGroup,
          })
        ).error?.code,
        "42501",
      );
      assert.equal(
        (
          await substitute.client.rpc("financial_report", {
            p_tenant: tenant,
            p_report: "payments",
          })
        ).error?.code,
        "42501",
      );
      assert.ok(
        (await subApp.get(`/timetable?date=${day(5)}&view=day`)).html.includes(
          `/lessons/${subLesson}`,
        ),
      );
    },
  );
  await t.test(
    "DST-invalid UI input rolls back while a valid local time keeps its intended timezone",
    async () => {
      const year = Number(today.slice(0, 4)) + 1,
        d = new Date(Date.UTC(year, 2, 1));
      d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7) + 7);
      const spring = d.toISOString().slice(0, 10),
        dst = await makeGroup("DST local-time group", second, [t2], {
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
        }),
        values = lessonData(0, "14:00", "15:00", {
          group_id: dst,
          teacher_id: t2,
          classroom_id: r2,
          timezone: "America/New_York",
          local_start: spring + "T02:30",
          local_end: spring + "T03:30",
          title: "DST-intent lesson",
        });
      const rejected = await app.post(
        `/lessons/new?group=${dst}`,
        "Create lesson",
        values,
      );
      assert.equal(rejected.response.status, 200);
      assert.ok(rejected.html.includes("Ambiguous or nonexistent"));
      assert.equal(
        (
          await rpc(owner, "lesson_directory", {
            p_tenant: tenant,
            p_filters: { group: dst, from: spring, to: spring },
          })
        ).total,
        0,
      );
      const created = await app.post(
        `/lessons/new?group=${dst}`,
        "Create lesson",
        {
          ...values,
          local_start: spring + "T03:30",
          local_end: spring + "T04:30",
        },
      );
      success(created);
      const id = /lessons\/([0-9a-f-]{36})/.exec(
        created.response.headers.get("location"),
      )[1];
      assert.equal(
        new Date((await ld(id)).lesson.starts_at).toISOString(),
        spring + "T07:30:00.000Z",
      );
      assert.equal((await ld(id)).lesson.timezone, "America/New_York");
    },
  );
  await t.test(
    "tenant/branch/role boundaries and tampered lesson, group, classroom IDs are enforced",
    async () => {
      assert.ok(
        (await managerApp.get(`/lessons/${manual}`)).html.includes(
          "Updated live lesson",
        ),
      );
      const hidden = await directLesson(
        hiddenGroup,
        lessonData(6, "14:00", "15:00", {
          classroom_id: r2,
          title: "Hidden branch teaching",
        }),
      );
      assert.ifError(hidden.error);
      assert.ok(
        !(await managerApp.get(`/lessons/${hidden.data}`)).html.includes(
          "Hidden branch teaching",
        ),
      );
      const forged = await managerApp.post(
        `/lessons/${manual}/edit`,
        "Save lesson details",
        { ...lessonData(1), lesson_id: hidden.data, classroom_id: r2 },
      );
      assert.ok([200, 404].includes(forged.response.status));
      assert.equal(
        (await ld(hidden.data)).lesson.title,
        "Hidden branch teaching",
      );
      const wrongTenant = await app.post(
        `/lessons/${manual}/edit`,
        "Save lesson details",
        { ...lessonData(1), tenant_id: foreign },
      );
      assert.equal(wrongTenant.response.status, 200);
      assert.ok(wrongTenant.html.includes("Business changed"));
      assert.equal(
        (
          await foreignUser.client.rpc("lesson_details", {
            p_tenant: tenant,
            p_lesson: manual,
          })
        ).error?.code,
        "42501",
      );
      assert.equal(
        (await employee.client.rpc("lesson_directory", { p_tenant: tenant }))
          .error?.code,
        "42501",
      );
      assert.equal(
        (
          await manager.client.rpc("group_schedule_details", {
            p_tenant: tenant,
            p_slot: slot,
          })
        ).error,
        null,
      );
      const raw = await foreignUser.client
        .from("lessons")
        .select("id")
        .eq("tenant_id", tenant);
      assert.ifError(raw.error);
      assert.deepEqual(raw.data, []);
    },
  );
  await t.test(
    "completed immutability, eligibility revocation and financial/student continuity remain intact",
    async () => {
      const before = await ld(past);
      assert.equal(
        (
          await owner.client.rpc("transition_lesson", {
            p_tenant: tenant,
            p_lesson: past,
            p_request: randomUUID(),
            p_version: 3,
            p_status: "cancelled",
            p_reason: "Invalid historical rewrite",
          })
        ).error?.code,
        "P0001",
      );
      assert.deepEqual(await ld(past), before);
      await rpc(owner, "archive_employee", {
        p_tenant: tenant,
        p_employee: sub,
      });
      assert.equal(
        (
          await substitute.client.rpc("lesson_details", {
            p_tenant: tenant,
            p_lesson: subLesson,
          })
        ).error?.code,
        "42501",
      );
      assert.deepEqual(
        await rpc(owner, "customer_financial_profile", {
          p_tenant: tenant,
          p_customer: student,
        }),
        financeBefore,
      );
      const original = await owner.client
        .from("student_profiles")
        .select("customer_id")
        .eq("tenant_id", tenant)
        .eq("customer_id", student)
        .single();
      assert.ifError(original.error);
      assert.equal(original.data.customer_id, student);
      assert.ok(
        (await app.get(`/students/${student}`)).html.includes(
          `/finance/invoices/${invoice}`,
        ),
      );
    },
  );
});
