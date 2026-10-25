import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
import { addDays } from "../../src/features/academics/calendar.mjs";

test("local academic dashboard, student timetable and enrollment invoice workflow", async (t) => {
  const owner = await localAccount("lms-integrations-owner"),
    teacher = await localAccount("lms-integrations-teacher"),
    other = await localAccount("lms-integrations-other-teacher"),
    manager = await localAccount("lms-integrations-manager"),
    employee = await localAccount("lms-integrations-employee"),
    foreign = await localAccount("lms-integrations-foreign");
  const tenant = await rpc(owner, "create_business", {
      p_name: "LMS integrations " + randomUUID().slice(0, 8),
    }),
    foreignTenant = await rpc(foreign, "create_business", {
      p_name: "Foreign LMS integrations",
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
    .insert({ tenant_id: tenant, name: "Other academic branch" })
    .select("id")
    .single();
  assert.ifError(secondResult.error);
  const second = secondResult.data.id;
  const roles = await owner.client
    .from("business_roles")
    .select("id,system_key")
    .eq("tenant_id", tenant);
  assert.ifError(roles.error);
  const role = (key) => roles.data.find((r) => r.system_key === key).id;
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    day = (n) => addDays(today, n),
    app = renderedApp(owner, tenant, branch),
    teacherApp = renderedApp(teacher, tenant, branch),
    managerApp = renderedApp(manager, tenant, branch);
  const link = async (account, branches) => {
    const id = await rpc(owner, "save_employee", {
      p_tenant: tenant,
      p_id: null,
      p_full_name:
        account === teacher ? "Primary live teacher" : "Other live teacher",
      p_phone: "",
      p_email: account.email,
      p_job_title: "Teacher",
      p_status: "active",
      p_start_date: day(-7),
      p_notes: "",
      p_branches: branches,
    });
    const token = await rpc(owner, "create_employee_invitation", {
      p_tenant: tenant,
      p_employee: id,
      p_role: role("teacher"),
    });
    await rpc(account, "accept_employee_invitation", { p_token: token });
    return id;
  };
  const teacherId = await link(teacher, [branch]),
    otherId = await link(other, [branch, second]);
  for (const [a, key] of [
    [manager, "manager"],
    [employee, "employee"],
  ])
    await rpc(owner, "assign_member_role", {
      p_tenant: tenant,
      p_user: a.id,
      p_role: role(key),
      p_branches: [branch],
    });
  const course = await rpc(owner, "save_course", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_version: 0,
    p_data: {
      name: "Integration course",
      standard_price: "777.77",
      pricing_model: "monthly",
    },
  });
  const group = async (name, b, teacher, cap = "5") => {
    const g = await rpc(owner, "save_study_group", {
      p_tenant: tenant,
      p_id: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: {
        name,
        branch_id: b,
        course_id: course,
        capacity: cap,
        start_date: day(-30),
        end_date: day(60),
      },
    });
    await rpc(owner, "set_group_teachers", {
      p_tenant: tenant,
      p_group: g,
      p_request: randomUUID(),
      p_version: 1,
      p_employees: [teacher],
      p_primary: teacher,
      p_reason: "Assign eligible instructor",
    });
    await rpc(owner, "change_group_status", {
      p_tenant: tenant,
      p_group: g,
      p_request: randomUUID(),
      p_version: 2,
      p_status: "active",
      p_reason: "Start integration teaching",
    });
    return g;
  };
  const g1 = await group("Integrated full group", branch, teacherId, "1"),
    g2 = await group("Integrated second group", branch, otherId),
    g3 = await group("Restricted other branch group", second, otherId);
  const student = await rpc(owner, "save_student", {
      p_tenant: tenant,
      p_request: randomUUID(),
      p_customer: null,
      p_profile: {
        first_name: "Original live LMS student",
        phone: "99890999333",
      },
      p_student: { student_identifier: "LIVE-LMS-STUDENT" },
      p_branches: [branch],
    }),
    shared = await rpc(owner, "save_student", {
      p_tenant: tenant,
      p_request: randomUUID(),
      p_customer: null,
      p_profile: {
        first_name: "Shared branch LMS student",
        phone: "99890999444",
      },
      p_student: {},
      p_branches: [branch, second],
    });
  const guardian = await rpc(owner, "save_student_guardian", {
    p_tenant: tenant,
    p_customer: student,
    p_guardian: null,
    p_full_name: "Parent contact stays guardian",
    p_phone: "99890999555",
    p_email: "",
    p_relationship: "Parent",
    p_emergency: true,
  });
  const enroll = (s, g, price = "750000.10") =>
    rpc(owner, "create_student_enrollment", {
      p_tenant: tenant,
      p_group: g,
      p_student: s,
      p_request: randomUUID(),
      p_data: {
        enrollment_date: today,
        effective_start_date: day(-20),
        status: "active",
        agreed_price: price,
        pricing_model: "monthly",
        notes: "Protected academic billing note",
      },
    });
  const enrollment = await enroll(student, g1),
    secondEnrollment = await enroll(student, g2, "9007199254740993.12"),
    foreignBranchEnrollment = await enroll(shared, g3);
  const original = await rpc(owner, "save_invoice_draft", {
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
        description: "Original posted invoice",
        quantity: "1",
        unit_price: "100",
        discount_amount: "0",
      },
    ],
  });
  await rpc(owner, "transition_invoice", {
    p_tenant: tenant,
    p_invoice: original,
    p_request: randomUUID(),
    p_version: 1,
    p_action: "issue",
  });
  const box = await rpc(owner, "save_cashbox", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_data: {
      name: "Original payment cashbox",
      branch_id: branch,
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
      notes: "Parent paid, student is debtor; descriptive note only",
    },
    p_allocations: [{ invoice_id: original, amount: "40" }],
  });
  const finance = () =>
      rpc(owner, "customer_financial_profile", {
        p_tenant: tenant,
        p_customer: student,
      }),
    before = await finance();
  const lesson = async (g, e, n, status) => {
    const id = await rpc(owner, "save_lesson", {
      p_tenant: tenant,
      p_group: g,
      p_id: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: {
        local_start: day(n) + "T10:00",
        local_end: day(n) + "T11:00",
        timezone: "Asia/Tashkent",
        teacher_id: e,
        title: "Student integration lesson",
        notes: "Private lesson reason",
      },
      p_reason: "Academic integration test",
    });
    if (status)
      await rpc(owner, "transition_lesson", {
        p_tenant: tenant,
        p_lesson: id,
        p_request: randomUUID(),
        p_version: 1,
        p_status: status,
        p_reason: "Lifecycle integration check",
      });
    return id;
  };
  const upcoming = await lesson(g1, teacherId, 1),
    completed = await lesson(g1, teacherId, -1, "completed"),
    cancelled = await lesson(g1, teacherId, 2, "cancelled"),
    hiddenLesson = await lesson(g3, otherId, 1);
  const report = (account = owner, filters = {}) =>
    rpc(account, "academic_overview", {
      p_tenant: tenant,
      p_filters: { from: day(-30), to: day(30), ...filters },
    });
  const invoiceArgs = (id = enrollment, key = randomUUID()) => ({
    p_tenant: tenant,
    p_enrollment: id,
    p_request: key,
    p_version: 1,
    p_issue_date: today,
    p_due_date: day(10),
    p_description: "Explicit October monthly tuition",
  });
  let draft;
  await t.test(
    "real dashboard aggregations and filtered report render",
    async () => {
      const d = await report();
      assert.equal(d.stats.unique_active_students, 2);
      assert.equal(d.stats.active_enrollments, 3);
      assert.equal(d.stats.at_capacity, 1);
      assert.equal(d.stats.completed_lessons, 1);
      const html = (
        await app.get(`/academics?branch=&from=${day(-30)}&to=${day(30)}`)
      ).html;
      assert.ok(html.includes("Academic overview"));
      assert.ok(html.includes("Unique active students"));
      assert.ok(html.includes(g1));
      assert.ok(html.includes(g3));
      const filtered = (
        await app.get(
          `/academics?branch=${branch}&teacher=${teacherId}&from=${day(-30)}&to=${day(30)}&capacity=full`,
        )
      ).html;
      assert.ok(filtered.includes(`/groups/${g1}`));
      assert.ok(!filtered.includes(`/groups/${g3}`));
      assert.equal(
        (await report(owner, { branch })).stats.unique_active_students,
        1,
      );
    },
  );
  await t.test(
    "unified student profile preserves guardians, original finance and academic history",
    async () => {
      const p = await app.get(`/students/${student}`);
      assert.equal(p.response.status, 200);
      for (const text of [
        "LIVE-LMS-STUDENT",
        "Parent contact stays guardian",
        "Academic activity",
        "Student lessons and timetable",
        "Linked enrollment charges",
        "Attendance marking",
        `/finance/invoices/${original}`,
        `/enrollments/${enrollment}`,
        `/enrollments/${secondEnrollment}`,
      ])
        assert.ok(p.html.includes(text), text);
      assert.ok(!p.html.includes(`/lessons/${hiddenLesson}`));
      const s = await rpc(owner, "student_academic_summary", {
        p_tenant: tenant,
        p_student: student,
      });
      assert.equal(s.active_groups, 2);
      assert.ok(s.activity.rows.some((a) => a.lesson_id === completed));
      assert.ok(!JSON.stringify(s).includes("Protected academic billing note"));
    },
  );
  await t.test(
    "student day, week and month timetables show only actual associated lessons",
    async () => {
      for (const view of ["day", "week", "month"]) {
        const p = await app.get(
          `/students/${student}/timetable?date=${day(1)}&view=${view}`,
        );
        assert.equal(p.response.status, 200);
        assert.ok(p.html.includes(`/lessons/${upcoming}`));
        assert.ok(!p.html.includes(`/lessons/${hiddenLesson}`));
      }
      const past = await app.get(
          `/students/${student}?lesson_from=${day(-7)}&lesson_to=${today}&lesson_status=completed`,
        ),
        lessonSection = /<section id="lessons"[\s\S]*?<\/section>/.exec(
          past.html,
        )?.[0];
      assert.ok(lessonSection);
      assert.ok(lessonSection.includes(`/lessons/${completed}`));
      assert.ok(!lessonSection.includes(`/lessons/${upcoming}`));
      const c = await rpc(owner, "student_lesson_directory", {
        p_tenant: tenant,
        p_student: student,
        p_filters: { from: day(-30), to: day(30), status: "cancelled" },
      });
      assert.equal(c.rows[0].id, cancelled);
    },
  );
  await t.test(
    "rendered draft form creates a real source-linked draft with an explicit debtor confirmation",
    async () => {
      const route = `/enrollments/${enrollment}/invoice`,
        page = await app.get(route);
      assert.ok(page.html.includes("Student and invoice debtor"));
      assert.ok(page.html.includes("guardian-as-debtor"));
      const rejected = await app.post(route, "Create draft invoice", {
        issue_date: today,
        due_date: day(10),
        description: "October course unit",
      });
      assert.ok(rejected.html.includes("Confirm the debtor"));
      const p = await app.post(route, "Create draft invoice", {
        issue_date: today,
        due_date: day(10),
        description: "October course unit",
        confirm_draft: "on",
      });
      assert.equal(p.response.status, 303);
      draft = /\/finance\/invoices\/([0-9a-f-]+)/.exec(
        p.response.headers.get("location"),
      )?.[1];
      assert.ok(draft);
      const d = await rpc(owner, "invoice_details", {
        p_tenant: tenant,
        p_invoice: draft,
      });
      assert.equal(d.invoice.state, "draft");
      assert.equal(d.invoice.customer_id, student);
      assert.equal(d.invoice.items[0].unit_price, "750000.10");
      assert.ok(
        (await app.get(`/finance/invoices/${draft}`)).html.includes(
          `/enrollments/${enrollment}`,
        ),
      );
      assert.ok(
        (await app.get(`/students/${student}`)).html.includes(
          `/finance/invoices/${draft}`,
        ),
      );
      const after = await finance();
      assert.deepEqual(after.summary, before.summary);
      assert.deepEqual(after.payment_summary, before.payment_summary);
    },
  );
  await t.test(
    "concurrent identical requests create one draft and retain exact decimal agreements",
    async () => {
      const args = invoiceArgs(secondEnrollment),
        results = await Promise.all(
          Array.from({ length: 3 }, () =>
            rpc(owner, "create_enrollment_invoice_draft", args),
          ),
        );
      assert.equal(new Set(results).size, 1);
      const b = await rpc(owner, "enrollment_billing_details", {
        p_tenant: tenant,
        p_enrollment: secondEnrollment,
      });
      assert.equal(b.total, 1);
      assert.equal(b.rows[0].total, "9007199254740993.12");
      const altered = await owner.client.rpc(
        "create_enrollment_invoice_draft",
        { ...args, p_description: "Changed request payload" },
      );
      assert.ok(altered.error);
    },
  );
  await t.test(
    "linked draft cannot be reassigned through the existing financial command",
    async () => {
      const r = await owner.client.rpc("save_invoice_draft", {
        p_tenant: tenant,
        p_invoice: draft,
        p_request: randomUUID(),
        p_version: 1,
        p_data: {
          branch_id: branch,
          customer_id: shared,
          issue_date: today,
          due_date: today,
          discount_amount: "0",
        },
        p_items: [
          {
            description: "Unsafe debtor move",
            quantity: "1",
            unit_price: "1",
            discount_amount: "0",
          },
        ],
      });
      assert.ok(r.error);
      const d = await rpc(owner, "invoice_details", {
        p_tenant: tenant,
        p_invoice: draft,
      });
      assert.equal(d.invoice.version, 1);
      assert.equal(d.invoice.customer_id, student);
      assert.equal(d.total, "750000.10");
    },
  );
  await t.test(
    "teachers see only assigned academic reports and cannot reach billing APIs or form actions",
    async () => {
      const d = await report(teacher);
      assert.equal(d.total, 1);
      assert.equal(d.stats.active_enrollments, 1);
      const html = (await teacherApp.get("/academics?branch=")).html;
      assert.ok(html.includes(`/groups/${g1}`));
      assert.ok(!html.includes(`/groups/${g2}`));
      assert.ok(!html.includes("750000.10"));
      const b = await rpc(teacher, "enrollment_billing_details", {
        p_tenant: tenant,
        p_enrollment: enrollment,
      });
      assert.deepEqual(b.rows, []);
      assert.equal(b.total, 0);
      assert.equal(b.can_create, false);
      for (const [name, args] of [
        ["create_enrollment_invoice_draft", invoiceArgs()],
        ["student_academic_summary", { p_tenant: tenant, p_student: student }],
        [
          "student_lesson_directory",
          {
            p_tenant: tenant,
            p_student: student,
            p_filters: { from: today, to: day(7) },
          },
        ],
      ])
        assert.ok((await teacher.client.rpc(name, args)).error, name);
      const route = `/enrollments/${enrollment}/invoice`,
        p = await teacherApp.get(route);
      assert.ok(
        p.response.status === 404 ||
          p.html.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
      );
      // Submit a real owner's action reference with the teacher's cookies.
      const ownerPage = (await app.get(route)).html,
        form = (ownerPage.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) || []).find(
          (f) => f.includes("Create draft invoice"),
        );
      assert.ok(form);
      const body = new FormData();
      for (const input of form.match(/<input\b[^>]*>/g) || []) {
        if (!input.includes('type="hidden"')) continue;
        const name = /name="([^"]*)"/.exec(input)?.[1],
          v = /value="([^"]*)"/.exec(input)?.[1] || "";
        if (name)
          body.set(name, v.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
      }
      for (const [k, v] of Object.entries({
        confirm_draft: "on",
        issue_date: today,
        due_date: today,
        description: "Forged teacher draft",
      }))
        body.set(k, v);
      const cookies = [
        ...teacher.cookies,
        ["forma-tenant", tenant],
        ["forma-branch", branch],
      ]
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("; ");
      const response = await fetch("http://127.0.0.1:3000" + route, {
        method: "POST",
        body,
        headers: { Cookie: cookies, Origin: "http://127.0.0.1:3000" },
        redirect: "manual",
      });
      assert.notEqual(response.status, 303);
      assert.equal(
        (
          await rpc(owner, "enrollment_billing_details", {
            p_tenant: tenant,
            p_enrollment: enrollment,
          })
        ).total,
        1,
      );
    },
  );
  await t.test(
    "branch managers, employees, foreign tenant and manipulated IDs stay restricted",
    async () => {
      assert.equal((await report(manager, { branch: second })).total, 0);
      assert.equal((await report(manager)).total, 2);
      const h = (await managerApp.get(`/academics?branch=${second}`)).html;
      assert.ok(!h.includes(`/groups/${g3}`));
      for (const [a, name, args] of [
        [
          manager,
          "create_enrollment_invoice_draft",
          invoiceArgs(foreignBranchEnrollment),
        ],
        [
          manager,
          "student_academic_summary",
          { p_tenant: tenant, p_student: shared },
        ],
        [
          employee,
          "academic_overview",
          { p_tenant: tenant, p_filters: { from: today, to: day(7) } },
        ],
        [foreign, "create_enrollment_invoice_draft", invoiceArgs()],
        [
          owner,
          "student_academic_summary",
          { p_tenant: foreignTenant, p_student: student },
        ],
        [owner, "create_enrollment_invoice_draft", invoiceArgs(randomUUID())],
      ])
        assert.ok((await a.client.rpc(name, args)).error, name);
      const links = await foreign.client
        .from("enrollment_invoice_links")
        .select("*")
        .eq("tenant_id", tenant);
      assert.ifError(links.error);
      assert.deepEqual(links.data, []);
      const unauth = await fetch("http://127.0.0.1:3000/academics", {
        redirect: "manual",
      });
      assert.equal(unauth.status, 307);
    },
  );
  await t.test(
    "withdrawal retains completed schedule, linked drafts, guardians and original posted balances",
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
          reason: "Withdraw after original lesson",
        },
      });
      const lessons = await rpc(owner, "student_lesson_directory", {
        p_tenant: tenant,
        p_student: student,
        p_filters: { from: day(-30), to: day(30) },
      });
      assert.ok(lessons.rows.some((l) => l.id === completed));
      assert.ok(!lessons.rows.some((l) => l.id === upcoming));
      const after = await finance();
      assert.deepEqual(after.summary, before.summary);
      assert.deepEqual(after.payment_summary, before.payment_summary);
      assert.equal(after.summary.outstanding, "60.00");
      assert.equal(after.payment_summary.credit, "20.10");
      const guardians = await owner.client
        .from("student_guardians")
        .select("guardian_id")
        .eq("tenant_id", tenant)
        .eq("customer_id", student);
      assert.ifError(guardians.error);
      assert.ok(guardians.data.some((g) => g.guardian_id === guardian));
      assert.equal(
        (
          await rpc(owner, "enrollment_billing_details", {
            p_tenant: tenant,
            p_enrollment: enrollment,
          })
        ).rows[0].id,
        draft,
      );
    },
  );
});
