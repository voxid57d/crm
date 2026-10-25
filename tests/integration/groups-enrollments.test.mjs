import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
test("real local group, teacher and enrollment forms with capacity/transfer races", async (t) => {
  const owner = await localAccount("groups-owner"),
    other = await localAccount("groups-other"),
    teacher = await localAccount("groups-teacher"),
    additional = await localAccount("groups-additional"),
    manager = await localAccount("groups-manager"),
    employee = await localAccount("groups-employee");
  const tenant = await rpc(owner, "create_business", {
      p_name: "Live learning " + randomUUID().slice(0, 8),
    }),
    foreign = await rpc(other, "create_business", {
      p_name: "Foreign learning",
    });
  const branch = (
    await owner.client
      .from("branches")
      .select("id")
      .eq("tenant_id", tenant)
      .single()
  ).data.id;
  const secondResult = await owner.client
    .from("branches")
    .insert({ tenant_id: tenant, name: "Other learning branch" })
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
    app = renderedApp(owner, tenant, branch),
    teacherApp = renderedApp(teacher, tenant, branch),
    managerApp = renderedApp(manager, tenant, branch);
  const roles = await owner.client
    .from("business_roles")
    .select("id,system_key")
    .eq("tenant_id", tenant);
  assert.ifError(roles.error);
  const role = (key) => roles.data.find((r) => r.system_key === key).id;
  const course = await rpc(owner, "save_course", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_version: 0,
    p_data: {
      name: "Live English catalog",
      standard_price: "750000.10",
      pricing_model: "monthly",
    },
  });
  const room = await rpc(owner, "save_classroom", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_version: 0,
    p_data: { branch_id: branch, name: "Live teaching room", capacity: "3" },
  });
  const groupData = {
    branch_id: branch,
    course_id: course,
    name: "Live Morning Group",
    code: "LIVE-G1",
    start_date: today,
    end_date: "",
    capacity: "2",
    classroom_id: room,
  };
  const agreement = {
    student_id: "",
    agreed_price: "9007199254740993.01",
    pricing_model: "monthly",
    enrollment_date: today,
    effective_start_date: today,
    effective_end_date: "",
    status: "pending",
    notes: "Private academic agreement note",
  };
  const gd = (id) =>
      rpc(owner, "study_group_details", { p_tenant: tenant, p_group: id }),
    ed = (id) =>
      rpc(owner, "student_enrollment_details", {
        p_tenant: tenant,
        p_enrollment: id,
      });
  const createGroup = (name, b = branch, capacity = "2") =>
    rpc(owner, "save_study_group", {
      p_tenant: tenant,
      p_id: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: {
        ...groupData,
        name,
        code: "",
        branch_id: b,
        classroom_id: "",
        capacity,
      },
    });
  const createStudent = (name, n) =>
    rpc(owner, "save_student", {
      p_tenant: tenant,
      p_request: randomUUID(),
      p_customer: null,
      p_profile: { first_name: name, phone: "99890666" + n },
      p_student: {},
      p_branches: [branch],
    });
  const success = (r) =>
    assert.equal(r.response.status, 303, r.html.slice(0, 700));
  let group,
    destination,
    firstStudent,
    secondStudent,
    enrollment,
    moved,
    teacherEmployee,
    additionalEmployee;
  await t.test(
    "group forms persist branch/course/classroom/capacity and reject stale or forged edits",
    async () => {
      const created = await app.post("/groups/new", "Create group", groupData);
      success(created);
      group = /groups\/([0-9a-f-]{36})/.exec(
        created.response.headers.get("location"),
      )[1];
      assert.equal((await gd(group)).group.classroom_id, room);
      success(
        await app.post(`/groups/${group}/edit`, "Save group", {
          ...groupData,
          name: "Live Morning Group edited",
        }),
      );
      const stale = await app.post(`/groups/${group}/edit`, "Save group", {
        ...groupData,
        version: "1",
        name: "Stale group",
      });
      assert.equal(stale.response.status, 200);
      assert.ok(stale.html.includes("This record changed"));
      const forged = await app.post(`/groups/${group}/edit`, "Save group", {
        ...groupData,
        tenant_id: foreign,
      });
      assert.equal(forged.response.status, 200);
      assert.ok(forged.html.includes("Business changed"));
      destination = await createGroup("Live Destination", second);
    },
  );
  await t.test(
    "existing Add Student form returns to group enrollment with the same student identity",
    async () => {
      const result = await app.post(
        `/students/new?enroll_group=${group}`,
        "Create student",
        {
          first_name: "Live enrolled student",
          phone: "998906661111",
          branch_ids: [branch],
          education_status: "active",
          student_identifier: "",
        },
      );
      success(result);
      assert.match(
        result.response.headers.get("location"),
        new RegExp(`/groups/${group}/enroll\\?student=`),
      );
      firstStudent = new URL(
        result.response.headers.get("location"),
        "http://127.0.0.1:3000",
      ).searchParams.get("student");
      const page = await app.get(
        `/groups/${group}/enroll?student=${firstStudent}`,
      );
      assert.ok(page.html.includes("Live enrolled student"));
      assert.ok(page.html.includes(`value="${firstStudent}" selected`));
      const reuse = await app.get(
        `/students/new?existing=${firstStudent}&enroll_group=${group}`,
      );
      assert.ok([200, 307].includes(reuse.response.status));
      assert.ok(
        (reuse.response.headers.get("location") ?? reuse.html).includes(
          `/groups/${group}/enroll?student=${firstStudent}`,
        ),
      );
      secondStudent = await createStudent("Second live student", "1112");
    },
  );
  await t.test(
    "enrollment form saves an exact independent agreement and group/profile/roster links remain canonical",
    async () => {
      const result = await app.post(
        `/groups/${group}/enroll`,
        "Enroll student",
        { ...agreement, student_id: firstStudent },
      );
      success(result);
      enrollment = /enrollments\/([0-9a-f-]{36})/.exec(
        result.response.headers.get("location"),
      )[1];
      assert.equal((await ed(enrollment)).enrollment.customer_id, firstStudent);
      assert.equal(
        (await ed(enrollment)).enrollment.agreed_price,
        agreement.agreed_price,
      );
      const duplicate = await app.post(
        `/groups/${group}/enroll`,
        "Enroll student",
        { ...agreement, student_id: firstStudent },
      );
      assert.equal(duplicate.response.status, 200);
      assert.ok(duplicate.html.includes("already exists"));
      const profile = await app.get(`/students/${firstStudent}`);
      assert.ok(profile.html.includes(`/enrollments/${enrollment}`));
      assert.ok(
        profile.html.includes("Courses, groups and enrollment history"),
      );
      assert.ok(
        (await app.get(`/groups/${group}`)).html.includes(
          `/students/${firstStudent}`,
        ),
      );
      await rpc(owner, "save_course", {
        p_tenant: tenant,
        p_id: course,
        p_request: randomUUID(),
        p_version: 1,
        p_data: {
          name: "Live English catalog",
          standard_price: "100",
          pricing_model: "per_lesson",
        },
      });
      assert.equal(
        (await ed(enrollment)).enrollment.agreed_price,
        agreement.agreed_price,
      );
    },
  );
  await t.test(
    "group activation and enrollment activate/pause/resume/withdraw forms preserve seats and history",
    async () => {
      success(
        await app.post(`/groups/${group}`, "Change group status", {
          status: "active",
          reason: "Start teaching",
          confirm: "on",
        }),
      );
      const update = (status) =>
        app.post(`/enrollments/${enrollment}`, "Save enrollment status", {
          status,
          effective_start_date: today,
          effective_end_date: "",
          notes: agreement.notes,
          reason: "Academic status change",
        });
      success(await update("active"));
      success(await update("paused"));
      assert.equal((await gd(group)).counts.reserved_seats, 1);
      success(await update("active"));
      const end = await app.post(`/groups/${group}`, "Change group status", {
        status: "completed",
        reason: "Close group",
        confirm: "on",
      });
      assert.equal(end.response.status, 200);
      assert.ok(end.html.includes("Close reserved enrollments"));
    },
  );
  await t.test(
    "teacher invitations link actual employees; primary/additional assignments work across branches",
    async () => {
      const link = async (account, name, branches) => {
        const id = await rpc(owner, "save_employee", {
          p_tenant: tenant,
          p_id: null,
          p_full_name: name,
          p_phone: "",
          p_email: account.email,
          p_job_title: "Teacher",
          p_status: "active",
          p_start_date: today,
          p_notes: "",
          p_branches: branches,
        });
        const token = await rpc(owner, "create_employee_invitation", {
          p_tenant: tenant,
          p_employee: id,
          p_role: role("teacher"),
        });
        assert.equal(
          await rpc(account, "accept_employee_invitation", { p_token: token }),
          tenant,
        );
        return id;
      };
      teacherEmployee = await link(teacher, "Live primary teacher", [branch]);
      additionalEmployee = await link(additional, "Live multi-branch teacher", [
        branch,
        second,
      ]);
      success(
        await app.post(
          `/groups/${group}/teachers`,
          "Save teacher assignments",
          {
            employee_ids: [teacherEmployee, additionalEmployee],
            primary_id: teacherEmployee,
            reason: "Initial teaching team",
          },
        ),
      );
      assert.equal((await gd(group)).group.teachers.length, 2);
      assert.ok(
        (await app.get(`/groups?teacher=${teacherEmployee}`)).html.includes(
          `/groups/${group}`,
        ),
      );
      await rpc(owner, "set_group_teachers", {
        p_tenant: tenant,
        p_group: destination,
        p_request: randomUUID(),
        p_version: 1,
        p_employees: [additionalEmployee],
        p_primary: additionalEmployee,
        p_reason: "Multi-branch assignment",
      });
    },
  );
  await t.test(
    "assigned teacher reads only assigned groups/rosters without agreement amounts, notes or finance",
    async () => {
      const page = await teacherApp.get(`/groups/${group}`);
      assert.equal(page.response.status, 200);
      assert.ok(page.html.includes("Live enrolled student"));
      assert.ok(!page.html.includes("Edit group"));
      assert.ok(!page.html.includes("9007199254740993.01"));
      const details = await teacherApp.get(`/enrollments/${enrollment}`);
      assert.ok(!details.html.includes("Private academic agreement note"));
      assert.ok(!details.html.includes("9007199254740993.01"));
      assert.ok(details.html.includes("Restricted"));
      assert.ok(!details.html.includes("Save enrollment status"));
      assert.ok(
        !(await teacherApp.get(`/groups/${destination}`)).html.includes(
          "Live Destination",
        ),
      );
      assert.ok(
        (
          await teacher.client.rpc("student_enrollment_details", {
            p_tenant: tenant,
            p_enrollment: enrollment,
          })
        ).data.enrollment.agreed_price === undefined,
      );
      assert.equal(
        (
          await teacher.client.rpc("financial_report", {
            p_tenant: tenant,
            p_report: "payments",
          })
        ).error?.code,
        "42501",
      );
      assert.ok(
        (await teacher.client.from("employee_salary_settings").select("*"))
          .error,
      );
    },
  );
  await t.test(
    "last-seat concurrent enrollment allows one winner and matching retries create one record",
    async () => {
      const last = await createGroup("Last seat race", branch, "1"),
        args = (student) => ({
          p_tenant: tenant,
          p_group: last,
          p_student: student,
          p_request: randomUUID(),
          p_data: agreement,
        });
      const results = await Promise.all([
        owner.client.rpc("create_student_enrollment", args(firstStudent)),
        owner.client.rpc("create_student_enrollment", args(secondStudent)),
      ]);
      assert.equal(results.filter((r) => !r.error).length, 1);
      assert.match(results.find((r) => r.error).error.message, /capacity/);
      assert.equal((await gd(last)).counts.reserved_seats, 1);
      const retryGroup = await createGroup("Retry race"),
        same = { ...args(secondStudent), p_group: retryGroup };
      const retries = await Promise.all([
        owner.client.rpc("create_student_enrollment", same),
        owner.client.rpc("create_student_enrollment", same),
      ]);
      retries.forEach((r) => assert.ifError(r.error));
      assert.equal(retries[0].data, retries[1].data);
      const [targetA, targetB] = await Promise.all([
        createGroup("Transfer race A"),
        createGroup("Transfer race B"),
      ]);
      const source = retries[0].data;
      const races = await Promise.all(
        [targetA, targetB].map((target) =>
          owner.client.rpc("transfer_student_enrollment", {
            p_tenant: tenant,
            p_enrollment: source,
            p_target: target,
            p_request: randomUUID(),
            p_version: 1,
            p_date: today,
            p_data: agreement,
            p_reason: "Competing transfer",
          }),
        ),
      );
      assert.equal(races.filter((r) => !r.error).length, 1);
      assert.equal(races.find((r) => r.error).error.code, "40001");
      assert.equal(
        (await gd(targetA)).counts.reserved_seats +
          (await gd(targetB)).counts.reserved_seats,
        1,
      );
    },
  );
  await t.test(
    "transfer form atomically preserves source agreement and branches; failed capacity and stale requests roll back",
    async () => {
      const full = await createGroup("Full transfer destination", second, "1");
      await rpc(owner, "create_student_enrollment", {
        p_tenant: tenant,
        p_group: full,
        p_student: secondStudent,
        p_request: randomUUID(),
        p_data: agreement,
        p_add_branch: true,
      });
      const before = await ed(enrollment),
        transfer = {
          target_id: full,
          transfer_date: today,
          agreed_price: "550000.10",
          pricing_model: "monthly",
          status: "pending",
          effective_end_date: "",
          notes: "Destination agreement",
          reason: "Branch transfer",
          add_branch: "on",
        };
      const failed = await app.post(
        `/enrollments/${enrollment}/transfer`,
        "Transfer student",
        transfer,
      );
      assert.equal(failed.response.status, 200);
      assert.ok(failed.html.includes("Group is at capacity"));
      assert.deepEqual(await ed(enrollment), before);
      const result = await app.post(
        `/enrollments/${enrollment}/transfer`,
        "Transfer student",
        { ...transfer, target_id: destination },
      );
      success(result);
      moved = /enrollments\/([0-9a-f-]{36})/.exec(
        result.response.headers.get("location"),
      )[1];
      assert.equal((await ed(moved)).enrollment.customer_id, firstStudent);
      assert.equal((await ed(moved)).enrollment.agreed_price, "550000.10");
      assert.equal(
        (await ed(enrollment)).enrollment.agreed_price,
        agreement.agreed_price,
      );
      assert.equal((await ed(enrollment)).transferred_to, moved);
      const branches = await owner.client
        .from("customer_branches")
        .select("branch_id")
        .eq("tenant_id", tenant)
        .eq("customer_id", firstStudent);
      assert.ifError(branches.error);
      assert.deepEqual(
        new Set(branches.data.map((b) => b.branch_id)),
        new Set([branch, second]),
      );
    },
  );
  await t.test(
    "foreign tenants, forged source/target IDs, manager branch limits and ordinary employees are rejected",
    async () => {
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
      assert.ok(
        (await managerApp.get(`/groups/${group}`)).html.includes(
          "Live Morning Group edited",
        ),
      );
      assert.ok(
        !(await managerApp.get(`/groups/${destination}`)).html.includes(
          "Live Destination",
        ),
      );
      const forged = await managerApp.post(
        `/groups/${group}/edit`,
        "Save group",
        { ...groupData, group_id: destination, capacity: "99" },
      );
      assert.ok([200, 404].includes(forged.response.status));
      assert.equal((await gd(destination)).group.capacity, 2);
      assert.equal(
        (
          await other.client.rpc("study_group_details", {
            p_tenant: tenant,
            p_group: group,
          })
        ).error?.code,
        "42501",
      );
      assert.equal(
        (
          await other.client.rpc("student_enrollment_details", {
            p_tenant: foreign,
            p_enrollment: moved,
          })
        ).error?.code,
        "42501",
      );
      assert.equal(
        (await employee.client.rpc("group_directory", { p_tenant: tenant }))
          .error?.code,
        "42501",
      );
      assert.equal(
        (
          await manager.client.rpc("transfer_student_enrollment", {
            p_tenant: tenant,
            p_enrollment: moved,
            p_target: group,
            p_request: randomUUID(),
            p_version: 1,
            p_date: today,
            p_data: agreement,
            p_reason: "Forged branch",
          })
        ).error?.code,
        "42501",
      );
      const raw = await other.client
        .from("study_groups")
        .select("id")
        .eq("tenant_id", tenant);
      assert.ifError(raw.error);
      assert.deepEqual(raw.data, []);
    },
  );
  await t.test(
    "terminal lifecycle, archive, assignment revocation and genuine course counts remain available",
    async () => {
      success(
        await app.post(`/enrollments/${moved}`, "Save enrollment status", {
          status: "cancelled",
          effective_start_date: today,
          effective_end_date: "",
          notes: "Cancel destination",
          reason: "Student changed plans",
        }),
      );
      success(
        await app.post(`/groups/${destination}`, "Change group status", {
          status: "cancelled",
          reason: "Cancelled delivery",
          confirm: "on",
        }),
      );
      success(
        await app.post(`/groups/${destination}`, "Change group status", {
          status: "archived",
          reason: "Archive history",
          confirm: "on",
        }),
      );
      assert.equal((await gd(destination)).group.status, "archived");
      await rpc(owner, "archive_employee", {
        p_tenant: tenant,
        p_employee: teacherEmployee,
      });
      assert.equal(
        (
          await teacher.client.rpc("study_group_details", {
            p_tenant: tenant,
            p_group: group,
          })
        ).error?.code,
        "42501",
      );
      assert.ok(
        (await app.get(`/courses/${course}`)).html.includes(
          "within your group access",
        ),
      );
      assert.ok(
        (await app.get("/enrollments?status=withdrawn&branch=")).html.includes(
          `/enrollments/${enrollment}`,
        ),
      );
    },
  );
});
