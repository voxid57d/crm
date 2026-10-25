import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "./local-app.mjs";
import { addDays } from "../../src/features/academics/calendar.mjs";
export async function attendanceFixture() {
  const owner = await localAccount("attendance-owner"),
    teacher = await localAccount("attendance-teacher"),
    other = await localAccount("attendance-other-teacher"),
    manager = await localAccount("attendance-manager"),
    employee = await localAccount("attendance-employee"),
    foreign = await localAccount("attendance-foreign");
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
  const lesson = async (g, e, n, status, extra = {}) => {
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
        ...extra,
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

  return {
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
    role,
    today,
    day,
    app,
    teacherApp,
    managerApp,
    teacherId,
    otherId,
    course,
    group,
    g1,
    g2,
    g3,
    student,
    shared,
    guardian,
    enroll,
    enrollment,
    secondEnrollment,
    foreignBranchEnrollment,
    original,
    box,
    finance,
    before,
    lesson,
  };
}
