import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rpc, renderedApp } from "../helpers/local-app.mjs";
import { attendanceFixture } from "../helpers/live-attendance.mjs";
test("real local attendance workspace, forms, historical references and concurrent commands", async (t) => {
  const f = await attendanceFixture(),
    {
      owner,
      teacher,
      other,
      manager,
      employee,
      foreign,
      tenant,
      foreignTenant,
      branch,
      second,
      day,
      today,
      app,
      teacherApp,
      managerApp,
      teacherId,
      otherId,
      group,
      g1,
      g2,
      g3,
      student,
      enrollment,
      finance,
      before,
      lesson,
    } = f;
  const originalLesson = await lesson(g1, teacherId, -1, "completed"),
    draftLesson = await lesson(g2, otherId, -2),
    restricted = await lesson(g3, otherId, -3),
    substitute = await lesson(g1, teacherId, -4, undefined, {
      substitute_id: otherId,
    }),
    future = await lesson(g1, teacherId, 7),
    cancelled = await lesson(g1, teacherId, -5, "cancelled");
  const path = (l) => `/lessons/${l}/attendance`,
    detail = (l = originalLesson, a = owner) =>
      rpc(a, "attendance_sheet_details", { p_tenant: tenant, p_lesson: l }),
    prepare = (l, a = owner, key = randomUUID()) =>
      rpc(a, "prepare_attendance_sheet", {
        p_tenant: tenant,
        p_lesson: l,
        p_request: key,
      });
  const markArgs = (l, v, marks, extra = {}) => ({
      p_tenant: tenant,
      p_lesson: l,
      p_request: randomUUID(),
      p_version: v,
      p_marks: marks,
      ...extra,
    }),
    finalArgs = (l, v, extra = {}) => ({
      p_tenant: tenant,
      p_lesson: l,
      p_request: randomUUID(),
      p_version: v,
      ...extra,
    });
  let sheet, record;
  await t.test(
    "workspace and actual lesson links render own, pending, upcoming and completed views",
    async () => {
      const h = (
        await teacherApp.get(
          `/attendance?view=awaiting&branch=&from=${day(-30)}&to=${today}`,
        )
      ).html;
      assert.ok(h.includes("Attendance workspace"));
      assert.ok(h.includes(path(originalLesson)));
      assert.ok(!h.includes(path(draftLesson)));
      assert.ok(!h.includes(path(restricted)));
      assert.ok(!h.includes(path(cancelled)));
      const upcoming = (
        await teacherApp.get("/attendance?view=upcoming&branch=")
      ).html;
      assert.ok(upcoming.includes(path(future)));
      const d = (await teacherApp.get(`/lessons/${originalLesson}`)).html;
      assert.ok(d.includes(path(originalLesson)));
      assert.ok(
        (await teacherApp.get(path(originalLesson))).html.includes(
          "Prepare attendance sheet",
        ),
      );
    },
  );
  await t.test(
    "real prepare form saves only Unmarked rows at the original enrollment identity",
    async () => {
      const p = await teacherApp.post(
        path(originalLesson),
        "Prepare attendance sheet",
        {},
      );
      assert.equal(p.response.status, 303);
      const d = await detail();
      sheet = d.sheet.id;
      record = d.rows[0].id;
      assert.equal(d.rows[0].customer_id, student);
      assert.equal(d.rows[0].enrollment_id, enrollment);
      assert.equal(d.rows[0].status, "unmarked");
      assert.equal(d.counts.absent, 0);
      assert.equal(d.sheet.state, "draft");
      const marks = (await teacherApp.get(path(originalLesson))).html;
      assert.ok(marks.includes("Mark page Present"));
      assert.ok(marks.includes("Undo page edits"));
      assert.ok(!marks.includes("750000.10"));
      assert.ok(!marks.includes("Protected academic billing note"));
    },
  );
  await t.test(
    "draft form supports Late notes and rejects stale versions and unknown row IDs",
    async () => {
      const p = await teacherApp.post(
        path(originalLesson),
        "Save attendance draft",
        {
          record_id: record,
          attendance_status: "late",
          attendance_note: "Arrived late, no sensitive reason",
          late_minutes: "6",
        },
      );
      assert.equal(p.response.status, 303);
      const d = await detail();
      assert.equal(d.sheet.version, 2);
      assert.equal(d.rows[0].status, "late");
      assert.equal(d.rows[0].late_minutes, 6);
      const stale = await teacher.client.rpc(
        "save_attendance_marks",
        markArgs(originalLesson, 1, [{ record_id: record, status: "absent" }]),
      );
      assert.equal(stale.error?.code, "40001");
      const forged = await teacher.client.rpc(
        "save_attendance_marks",
        markArgs(originalLesson, 2, [
          { record_id: randomUUID(), status: "present" },
        ]),
      );
      assert.equal(forged.error?.code, "42501");
      assert.equal((await detail()).sheet.version, 2);
      const tampered = await teacherApp.post(
        path(originalLesson),
        "Save attendance draft",
        {
          tenant_id: foreignTenant,
          record_id: record,
          attendance_status: "absent",
          attendance_note: "",
          late_minutes: "",
        },
      );
      assert.ok(tampered.html.includes("Business changed"));
      const forgedForm = await teacherApp.post(
        path(originalLesson),
        "Save attendance draft",
        {
          record_id: randomUUID(),
          attendance_status: "present",
          attendance_note: "",
          late_minutes: "",
        },
      );
      assert.ok(forgedForm.html.includes("Attendance save rejected"));
      assert.equal((await detail()).sheet.version, 2);
    },
  );
  await t.test(
    "finalization requires confirmation and preserves a distinct lesson-completion state",
    async () => {
      const route = path(originalLesson);
      const no = await teacherApp.post(route, "Finalize attendance", {});
      assert.ok(no.html.includes("Confirm the saved marks"));
      const p = await teacherApp.post(route, "Finalize attendance", {
        confirm_finalization: "on",
      });
      assert.equal(p.response.status, 303);
      const d = await detail();
      assert.equal(d.sheet.state, "finalized");
      assert.equal(d.sheet.version, 3);
      assert.equal(d.lesson.status, "completed");
      assert.equal(d.counts.late, 1);
      assert.equal(d.can_manage, false);
      assert.equal((await detail(originalLesson, teacher)).can_correct, false);
      const denied = await teacher.client.rpc(
        "save_attendance_marks",
        markArgs(originalLesson, 3, [{ record_id: record, status: "absent" }], {
          p_correct: true,
          p_reason: "Teacher escalation",
        }),
      );
      assert.equal(denied.error?.code, "42501");
    },
  );
  await t.test(
    "Owner correction form persists reason, prior values, actor and immutable finalization",
    async () => {
      const p = await app.post(
        path(originalLesson),
        "Save authorized correction",
        {
          record_id: record,
          attendance_status: "excused",
          attendance_note: "Excused by academic office",
          late_minutes: "",
          reason: "Reviewed attendance correction",
        },
      );
      assert.equal(p.response.status, 303);
      const d = await detail();
      assert.equal(d.sheet.state, "finalized");
      assert.equal(d.sheet.correction_count, 1);
      assert.equal(d.counts.excused, 1);
      assert.ok(
        d.history.rows.some(
          (e) =>
            e.record_id === record &&
            e.before_data.status === "late" &&
            e.after_data.status === "excused" &&
            e.reason === "Reviewed attendance correction" &&
            e.actor_name,
        ),
      );
      const raw = await teacher.client.from("attendance_events").select("*");
      assert.ok(raw.error);
      const del = await owner.client
        .from("lesson_attendance_records")
        .delete()
        .eq("id", record);
      assert.ok(del.error);
    },
  );
  await t.test(
    "substitute is authorized to mark only their assigned lesson; original teacher is read-only",
    async () => {
      const subApp = renderedApp(other, tenant, branch);
      assert.equal((await detail(substitute, teacher)).can_manage, false);
      assert.equal((await detail(substitute, other)).can_manage, true);
      const p = await subApp.post(
        path(substitute),
        "Prepare attendance sheet",
        {},
      );
      assert.equal(p.response.status, 303);
      const d = await detail(substitute);
      const r = await subApp.post(path(substitute), "Save attendance draft", {
        record_id: d.rows[0].id,
        attendance_status: "present",
        attendance_note: "Substitute marked actual lesson",
        late_minutes: "",
      });
      assert.equal(r.response.status, 303);
      const denied = await teacher.client.rpc("prepare_attendance_sheet", {
        p_tenant: tenant,
        p_lesson: substitute,
        p_request: randomUUID(),
      });
      assert.equal(denied.error?.code, "42501");
    },
  );
  await t.test(
    "concurrent prepares are unique and concurrent draft updates allow one version winner",
    async () => {
      const same = await Promise.all(
        Array.from({ length: 3 }, () => prepare(draftLesson)),
      );
      assert.equal(new Set(same).size, 1);
      const d = await detail(draftLesson),
        id = d.rows[0].id;
      const writes = await Promise.all(
        ["present", "absent"].map((status) =>
          owner.client.rpc(
            "save_attendance_marks",
            markArgs(draftLesson, 1, [{ record_id: id, status }]),
          ),
        ),
      );
      assert.equal(writes.filter((r) => !r.error).length, 1);
      assert.equal(writes.filter((r) => r.error?.code === "40001").length, 1);
      const next = await detail(draftLesson),
        args = markArgs(draftLesson, next.sheet.version, [
          {
            record_id: id,
            status: "present",
            notes: "Idempotent draft",
            late_minutes: "",
          },
        ]);
      const repeated = await Promise.all([
        rpc(owner, "save_attendance_marks", args),
        rpc(owner, "save_attendance_marks", args),
      ]);
      assert.equal(repeated[0], repeated[1]);
      assert.equal(
        (await detail(draftLesson)).sheet.version,
        next.sheet.version + 1,
      );
    },
  );
  await t.test(
    "future/cancelled marking and manipulated tenant, branch, lesson and record IDs are rejected",
    async () => {
      for (const [a, l] of [
        [teacher, draftLesson],
        [teacher, restricted],
        [manager, restricted],
        [employee, originalLesson],
        [foreign, originalLesson],
      ]) {
        const r = await a.client.rpc("prepare_attendance_sheet", {
          p_tenant: tenant,
          p_lesson: l,
          p_request: randomUUID(),
        });
        assert.equal(r.error?.code, "42501");
      }
      for (const l of [future, cancelled])
        assert.ok(
          (
            await owner.client.rpc("prepare_attendance_sheet", {
              p_tenant: tenant,
              p_lesson: l,
              p_request: randomUUID(),
            })
          ).error,
        );
      assert.ok(
        (
          await owner.client.rpc("attendance_sheet_details", {
            p_tenant: foreignTenant,
            p_lesson: originalLesson,
          })
        ).error,
      );
      assert.ok(
        (
          await owner.client.rpc("attendance_sheet_details", {
            p_tenant: tenant,
            p_lesson: randomUUID(),
          })
        ).error,
      );
      const m = (
        await managerApp.get(
          `/attendance?branch=${second}&view=all&from=${day(-30)}&to=${day(30)}`,
        )
      ).html;
      assert.ok(!m.includes(path(restricted)));
      const raw = await foreign.client
        .from("lesson_attendance_records")
        .select("*")
        .eq("tenant_id", tenant);
      assert.ifError(raw.error);
      assert.deepEqual(raw.data, []);
      const unauth = await fetch(
        "http://127.0.0.1:3000" + path(originalLesson),
        { redirect: "manual" },
      );
      assert.equal(unauth.status, 307);
    },
  );
  await t.test(
    "draft roster review is explicit and changed enrollment cannot silently finalize",
    async () => {
      const d = await detail(draftLesson);
      await rpc(
        owner,
        "save_attendance_marks",
        markArgs(
          draftLesson,
          d.sheet.version,
          d.rows
            .filter((r) => r.is_expected)
            .map((r) => ({
              record_id: r.id,
              status: "unmarked",
              notes: "",
              late_minutes: "",
            })),
        ),
      );
      const s = await rpc(owner, "save_student", {
        p_tenant: tenant,
        p_request: randomUUID(),
        p_customer: null,
        p_profile: {
          first_name: "Late registration for historical lesson",
          phone: "99890999666",
        },
        p_student: {},
        p_branches: [branch],
      });
      await f.enroll(s, g2);
      const changed = await detail(draftLesson);
      assert.equal(changed.roster_changed, true);
      assert.ok(
        (
          await owner.client.rpc(
            "finalize_attendance_sheet",
            finalArgs(draftLesson, changed.sheet.version),
          )
        ).error,
      );
      const p = await app.post(
        path(draftLesson),
        "Review enrollment roster",
        {},
      );
      assert.equal(p.response.status, 303);
      const reviewed = await detail(draftLesson);
      assert.ok(
        reviewed.rows.some(
          (r) => r.customer_id === s && r.status === "unmarked",
        ),
      );
      assert.equal(reviewed.roster_changed, false);
    },
  );
  await t.test(
    "history filters keep original identities and teacher financial privacy after withdrawal",
    async () => {
      await rpc(owner, "update_student_enrollment", {
        p_tenant: tenant,
        p_enrollment: enrollment,
        p_request: randomUUID(),
        p_version: 1,
        p_data: {
          status: "withdrawn",
          effective_start_date: day(-20),
          effective_end_date: today,
          reason: "Leave group after marked lesson",
        },
      });
      const d = await detail();
      assert.equal(d.sheet.id, sheet);
      assert.equal(d.rows[0].customer_id, student);
      assert.equal(d.rows[0].enrollment_id, enrollment);
      assert.equal(d.rows[0].status, "excused");
      const html = (
        await teacherApp.get(
          `/attendance/history?branch=&student=${student}&status=excused&sheet=finalized&from=${day(-30)}&to=${today}`,
        )
      ).html;
      assert.ok(html.includes(path(originalLesson)));
      assert.ok(html.includes("excused"));
      assert.ok(!html.includes("750000.10"));
      assert.ok(!html.includes("9007199254740993"));
      assert.ok(!html.includes("Protected academic billing note"));
      const after = await finance();
      assert.deepEqual(after, before);
      assert.equal(after.summary.outstanding, "60.00");
      assert.equal(after.payment_summary.credit, "20.10");
      const original = (await app.get(`/students/${student}`)).html;
      assert.ok(original.includes("Original live LMS student"));
      assert.ok(original.includes(`/attendance/history?student=${student}`));
    },
  );
  await t.test(
    "empty sheet confirmation, all-Absent drafts and finalized cancellation guards work",
    async () => {
      const g = await group("Empty live attendance group", branch, otherId),
        l = await lesson(g, otherId, -6);
      await prepare(l);
      assert.ok(
        (await owner.client.rpc("finalize_attendance_sheet", finalArgs(l, 1)))
          .error,
      );
      await rpc(
        owner,
        "finalize_attendance_sheet",
        finalArgs(l, 1, { p_confirm_empty: true }),
      );
      assert.equal((await detail(l)).counts.absent, 0);
      const d = await detail(draftLesson);
      await rpc(
        owner,
        "save_attendance_marks",
        markArgs(
          draftLesson,
          d.sheet.version,
          d.rows
            .filter((r) => r.is_expected)
            .map((r) => ({
              record_id: r.id,
              status: "absent",
              notes: "",
              late_minutes: "",
            })),
        ),
      );
      const marked = await detail(draftLesson);
      assert.equal(marked.counts.absent, 2);
      await rpc(
        owner,
        "finalize_attendance_sheet",
        finalArgs(draftLesson, marked.sheet.version),
      );
      assert.equal((await detail(draftLesson)).lesson.status, "scheduled");
      const cancelled = await owner.client.rpc("transition_lesson", {
        p_tenant: tenant,
        p_lesson: draftLesson,
        p_request: randomUUID(),
        p_version: 1,
        p_status: "cancelled",
        p_reason: "Unsafe final attendance cancellation",
      });
      assert.ok(cancelled.error);
      assert.equal((await detail(draftLesson)).sheet.state, "finalized");
    },
  );
});
