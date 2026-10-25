import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rpc, renderedApp } from "../helpers/local-app.mjs";
import { attendanceFixture } from "../helpers/live-attendance.mjs";
test("real non-teaching calendar, exceptions, rescheduling and reopening races", async (t) => {
  const f = await attendanceFixture(),
    {
      owner,
      teacher,
      manager,
      employee,
      foreign,
      tenant,
      branch,
      second,
      today,
      day,
      app,
      teacherApp,
      managerApp,
      teacherId,
      otherId,
      g1,
      g2,
      g3,
      lesson,
      finance,
      before,
    } = f;
  const slot = async (g, e, n, m) => {
    const date = day(n),
      wd = new Date(date + "T00:00:00Z").getUTCDay() || 7;
    return rpc(owner, "save_group_schedule", {
      p_tenant: tenant,
      p_group: g,
      p_id: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: {
        weekday: String(wd),
        start_time: "10:00",
        end_time: "11:00",
        timezone: "Asia/Tashkent",
        effective_from: date,
        effective_to: day(m),
        teacher_id: e,
      },
      p_reason: "Calendar integration fixture",
    });
  };
  const slotId = await slot(g1, teacherId, 14, 28),
    period = await rpc(owner, "group_schedule_details", {
      p_tenant: tenant,
      p_slot: slotId,
    }),
    series = period.slot.series_id;
  const existing = await lesson(g1, teacherId, 7),
    closureArgs = (b, n, m = n, id = null, v = 0, extra = {}) => ({
      p_tenant: tenant,
      p_id: id,
      p_request: randomUUID(),
      p_version: v,
      p_data: {
        branch_id: b,
        name: "School non-teaching period",
        reason: "Explicit school calendar rule",
        from_date: day(n),
        to_date: day(m),
        is_active: true,
        ...extra,
      },
    }),
    exceptionArgs = (s, n, id = null, v = 0, active = true) => ({
      p_tenant: tenant,
      p_id: id,
      p_request: randomUUID(),
      p_version: v,
      p_data: {
        series_id: s,
        occurrence_date: day(n),
        is_active: active,
        reason: "Skip one weekly occurrence",
      },
    }),
    gen = (g, n, m, key = randomUUID()) =>
      rpc(owner, "generate_group_lessons", {
        p_tenant: tenant,
        p_group: g,
        p_request: key,
        p_from: day(n),
        p_to: day(m),
      });
  let closure, exception, batch;
  await t.test(
    "closure create form stores real scoped dates and preserves existing lesson identity",
    async () => {
      const old = await rpc(owner, "lesson_details", {
        p_tenant: tenant,
        p_lesson: existing,
      });
      const p = await app.post(
        "/scheduling/closures/new",
        "Create non-teaching date",
        {
          branch_id: branch,
          name: "Branch holiday",
          reason: "Local center holiday",
          from_date: day(7),
          to_date: day(7),
          is_active: "true",
        },
      );
      assert.equal(p.response.status, 303);
      closure = /\/scheduling\/closures\/([0-9a-f-]+)/.exec(
        p.response.headers.get("location"),
      )?.[1];
      assert.ok(closure);
      assert.deepEqual(
        await rpc(owner, "lesson_details", {
          p_tenant: tenant,
          p_lesson: existing,
        }),
        old,
      );
      const d = (await app.get(`/scheduling/closures/${closure}`)).html;
      assert.ok(d.includes(`/lessons/${existing}`));
      assert.ok(d.includes("Reschedule outside closure"));
      assert.ok(d.includes("Local center holiday"));
      const parent = (await app.get(`/lessons/${existing}`)).html;
      assert.ok(parent.includes("overlaps an active non-teaching period"));
    },
  );
  await t.test(
    "calendar day/week/month integrate actual closure badges without hiding retained bookings",
    async () => {
      for (const view of ["day", "week", "month"]) {
        const p = await app.get(
          `/timetable?date=${day(7)}&view=${view}&branch=${branch}`,
        );
        assert.equal(p.response.status, 200);
        assert.ok(p.html.includes("Non-teaching: "));
        assert.ok(p.html.includes("Branch holiday"));
        assert.ok(p.html.includes(`/lessons/${existing}`));
      }
    },
  );
  await t.test(
    "occurrence exception form and generation form produce exact skip receipts",
    async () => {
      await rpc(owner, "save_academic_closure", closureArgs(branch, 14));
      const route = `/groups/${g1}/schedules/exceptions`;
      const p = await app.post(route, "Skip weekly occurrence", {
        series_id: series,
        occurrence_date: day(21),
        reason: "Class-specific exception",
        is_active: "true",
      });
      assert.equal(p.response.status, 303);
      const listing = await rpc(owner, "schedule_exception_directory", {
        p_tenant: tenant,
        p_group: g1,
      });
      exception = listing.rows[0].id;
      assert.equal(listing.rows[0].occurrence_date, day(21));
      const generated = await app.post(
        `/groups/${g1}/schedules`,
        "Generate lessons",
        { from: day(14), to: day(28) },
      );
      assert.equal(generated.response.status, 303);
      const location = generated.response.headers.get("location"),
        bid = /batch=([0-9a-f-]+)/.exec(location)?.[1];
      assert.ok(bid);
      batch = await rpc(owner, "generation_batch_details", {
        p_tenant: tenant,
        p_batch: bid,
      });
      assert.equal(batch.created_count, 1);
      assert.equal(batch.closure_count, 1);
      assert.equal(batch.exception_count, 1);
      const receipt = (await app.get(`/scheduling/generation/${bid}`)).html;
      assert.ok(receipt.includes("closure skips"));
      assert.ok(receipt.includes("Retained occurrence exception"));
      assert.ok(receipt.includes("Retained non-teaching date"));
      assert.ok(
        (await app.get(route + "?history=" + exception)).html.includes(
          "Occurrence exception history",
        ),
      );
    },
  );
  await t.test(
    "moving a closed lesson fails atomically into another closure and succeeds with a linked replacement",
    async () => {
      const route = `/lessons/${existing}/reschedule`,
        fields = (n) => ({
          group_id: g1,
          local_start: day(n) + "T10:00",
          local_end: day(n) + "T11:00",
          timezone: "Asia/Tashkent",
          teacher_id: teacherId,
          substitute_id: "",
          classroom_id: "",
          title: "Moved calendar lesson",
          notes: "One-off change",
          reason: "Reschedule retained holiday booking",
        });
      const no = await app.post(route, "Reschedule lesson", fields(14));
      assert.ok(no.html.includes("Non-teaching date conflict"));
      assert.equal(
        (
          await rpc(owner, "lesson_details", {
            p_tenant: tenant,
            p_lesson: existing,
          })
        ).lesson.status,
        "scheduled",
      );
      const yes = await app.post(route, "Reschedule lesson", fields(8));
      assert.equal(yes.response.status, 303);
      const moved = /\/lessons\/([0-9a-f-]+)/.exec(
        yes.response.headers.get("location"),
      )?.[1];
      assert.ok(moved);
      const d = await rpc(owner, "lesson_details", {
        p_tenant: tenant,
        p_lesson: moved,
      });
      assert.equal(d.lesson.rescheduled_from_id, existing);
      const cancelled = await app.post(
        `/lessons/${moved}`,
        "Change lesson status",
        {
          status: "cancelled",
          reason: "Explicit replacement cancellation",
          confirm: "on",
        },
      );
      assert.equal(cancelled.response.status, 303);
      const context = await rpc(owner, "lesson_calendar_context", {
        p_tenant: tenant,
        p_lesson: moved,
      });
      assert.equal(context.cancellation.previous_status, "scheduled");
      assert.equal(
        context.cancellation.reason,
        "Explicit replacement cancellation",
      );
      const feed = (
        await teacherApp.get(`/scheduling/changes?from=${today}&to=${today}`)
      ).html;
      assert.ok(feed.includes("Original lesson rescheduled"));
      assert.ok(feed.includes("Lesson cancelled"));
      assert.ok(!feed.includes("750000.10"));
    },
  );
  await t.test(
    "retiring a closure and cross-branch booking concurrently allow one resource winner",
    async () => {
      await slot(g2, otherId, 35, 49);
      const args = closureArgs(branch, 35),
        c = await rpc(owner, "save_academic_closure", args);
      const requests = await Promise.all([
        owner.client.rpc(
          "save_academic_closure",
          closureArgs(branch, 35, 35, c, 1, { is_active: false }),
        ),
        owner.client.rpc("save_lesson", {
          p_tenant: tenant,
          p_group: g3,
          p_id: null,
          p_request: randomUUID(),
          p_version: 0,
          p_data: {
            local_start: day(35) + "T10:00",
            local_end: day(35) + "T11:00",
            timezone: "Asia/Tashkent",
            teacher_id: otherId,
            title: "Cross-branch competing lesson",
          },
          p_reason: "Reopening race fixture",
        }),
      ]);
      assert.equal(requests.filter((r) => !r.error).length, 1);
      assert.equal(requests.filter((r) => r.error?.code === "23P01").length, 1);
    },
  );
  await t.test(
    "generation and closure creation serialize without modifying a lesson created first",
    async () => {
      await slot(g2, otherId, 56, 56);
      const [generated, closed] = await Promise.all([
        gen(g2, 56, 56),
        rpc(owner, "save_academic_closure", closureArgs(branch, 56)),
      ]);
      assert.ok(closed);
      assert.equal(generated.created_count + generated.closure_count, 1);
      const impact = await rpc(owner, "closure_lesson_impact", {
        p_tenant: tenant,
        p_closure: closed,
      });
      assert.equal(impact.total, generated.created_count);
    },
  );
  await t.test(
    "Manager cannot create business-wide holidays; Teacher/Employee/foreign and forged IDs are denied",
    async () => {
      const forbidden = await manager.client.rpc(
        "save_academic_closure",
        closureArgs(null, 40),
      );
      assert.equal(forbidden.error?.code, "42501");
      const own = await managerApp.post(
        "/scheduling/closures/new",
        "Create non-teaching date",
        {
          branch_id: branch,
          name: "Manager branch closure",
          reason: "Authorized one branch",
          from_date: day(40),
          to_date: day(40),
          is_active: "true",
        },
      );
      assert.equal(own.response.status, 303);
      for (const a of [teacher, employee, foreign])
        assert.ok(
          (await a.client.rpc("save_academic_closure", closureArgs(branch, 41)))
            .error,
        );
      assert.ok(
        (
          await manager.client.rpc(
            "save_academic_closure",
            closureArgs(second, 42),
          )
        ).error,
      );
      assert.ok(
        (
          await foreign.client.rpc("academic_closure_details", {
            p_tenant: tenant,
            p_closure: closure,
          })
        ).error,
      );
      assert.ok(
        (
          await owner.client.rpc(
            "save_schedule_exception",
            exceptionArgs(randomUUID(), 42),
          )
        ).error,
      );
      const raw = await foreign.client
        .from("academic_closures")
        .select("*")
        .eq("tenant_id", tenant);
      assert.ifError(raw.error);
      assert.deepEqual(raw.data, []);
      const teacherForm = await renderedApp(teacher, tenant, branch).get(
        "/scheduling/closures/new",
      );
      assert.ok(
        teacherForm.response.status === 404 ||
          teacherForm.html.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
      );
      const tampered = await app.post(
        `/groups/${g1}/schedules/exceptions`,
        "Skip weekly occurrence",
        {
          group_id: g3,
          series_id: series,
          occurrence_date: day(28),
          reason: "Wrong parent group",
          is_active: "true",
        },
      );
      assert.ok(
        tampered.html.includes(
          "Choose a weekly series in this authorized group",
        ),
      );
    },
  );
  await t.test(
    "stale closure edits fail and prior skip receipts/posted finance remain unchanged",
    async () => {
      const edited = await app.post(
        `/scheduling/closures/${closure}`,
        "Save non-teaching date",
        {
          name: "Reviewed branch holiday",
          reason: "Holiday naming and status reviewed",
          from_date: day(7),
          to_date: day(7),
          is_active: "false",
        },
      );
      assert.equal(edited.response.status, 303);
      assert.equal(
        (
          await rpc(owner, "academic_closure_details", {
            p_tenant: tenant,
            p_closure: closure,
          })
        ).closure.is_active,
        false,
      );
      const restored = await app.post(
        `/groups/${g1}/schedules/exceptions`,
        "Update occurrence exception",
        {
          id: exception,
          version: "1",
          series_id: series,
          occurrence_date: day(21),
          reason: "Restore the normal occurrence",
          is_active: "false",
        },
      );
      assert.equal(restored.response.status, 303);
      assert.equal((await gen(g1, 21, 21)).created_count, 1);
      const d = await rpc(owner, "academic_closure_details", {
        p_tenant: tenant,
        p_closure: closure,
      });
      const stale = await owner.client.rpc(
        "save_academic_closure",
        closureArgs(branch, 7, 7, closure, 0),
      );
      assert.equal(stale.error?.code, "40001");
      assert.equal(
        (
          await rpc(owner, "academic_closure_details", {
            p_tenant: tenant,
            p_closure: closure,
          })
        ).closure.version,
        d.closure.version,
      );
      assert.equal(
        (
          await rpc(owner, "generation_batch_details", {
            p_tenant: tenant,
            p_batch: batch.id,
          })
        ).exception_count,
        1,
      );
      assert.deepEqual(await finance(), before);
      const unauth = await fetch("http://127.0.0.1:3000/scheduling/closures", {
        redirect: "manual",
      });
      assert.equal(unauth.status, 307);
    },
  );
});
