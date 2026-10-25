import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";

test("local course/classroom forms, permissions and concurrent commands", async (t) => {
  const owner = await localAccount("academic-owner"),
    other = await localAccount("academic-other"),
    manager = await localAccount("academic-manager"),
    teacher = await localAccount("academic-teacher"),
    employee = await localAccount("academic-employee");
  const tenant = await rpc(owner, "create_business", {
      p_name: "Academic forms " + randomUUID().slice(0, 8),
    }),
    foreign = await rpc(other, "create_business", {
      p_name: "Foreign academic business",
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
    .insert({ tenant_id: tenant, name: "Restricted academic branch" })
    .select("id")
    .single();
  assert.ifError(secondResult.error);
  const second = secondResult.data.id;
  const app = renderedApp(owner, tenant, branch),
    managerApp = renderedApp(manager, tenant, branch),
    teacherApp = renderedApp(teacher, tenant, branch);
  const courseInput = {
    name: "Live English A1",
    code: "LIVE-A1",
    description: "Real catalog form",
    category_id: "",
    level_id: "",
    duration_value: "12",
    duration_unit: "weeks",
    lesson_duration_minutes: "90",
    standard_price: "9007199254740993.01",
    pricing_model: "monthly",
  };
  const roomInput = {
    branch_id: branch,
    name: "Live Room 101",
    description: "Real classroom",
    capacity: "12",
  };
  const details = (id) =>
    rpc(owner, "course_details", { p_tenant: tenant, p_course: id });
  const roomDetails = (id) =>
    rpc(owner, "classroom_details", { p_tenant: tenant, p_classroom: id });
  const success = (result) =>
    assert.equal(result.response.status, 303, result.html.slice(0, 500));
  let category, level, course, room, hiddenRoom;
  await t.test(
    "categories and levels save through rendered forms and keep the selected settings tab",
    async () => {
      success(
        await app.post("/courses/settings", "Create category", {
          name: "Live languages",
          is_active: "true",
        }),
      );
      const result = await app.post(
        "/courses/settings?kind=level",
        "Create level",
        { name: "Live A1", is_active: "true" },
      );
      success(result);
      assert.match(result.response.headers.get("location"), /kind=level/);
      const options = await rpc(owner, "course_catalog_options", {
        p_tenant: tenant,
      });
      category = options.categories[0].id;
      level = options.levels[0].id;
      courseInput.category_id = category;
      courseInput.level_id = level;
    },
  );
  await t.test(
    "create/edit forms persist exact price and references; stale edits and invalid prices fail atomically",
    async () => {
      const created = await app.post(
        "/courses/new",
        "Create course",
        courseInput,
      );
      success(created);
      course = /courses\/([0-9a-f-]{36})/.exec(
        created.response.headers.get("location"),
      )[1];
      assert.equal(
        (await details(course)).course.standard_price,
        courseInput.standard_price,
      );
      const visible = await app.get(`/courses/${course}`);
      assert.equal(visible.response.status, 200);
      assert.ok(visible.html.includes("Live English A1"));
      assert.ok(visible.html.includes("Live languages"));
      success(
        await app.post(`/courses/${course}/edit`, "Save course", {
          ...courseInput,
          standard_price: "750000.10",
        }),
      );
      const stale = await app.post(`/courses/${course}/edit`, "Save course", {
        ...courseInput,
        version: "1",
        standard_price: "123",
      });
      assert.equal(stale.response.status, 200);
      assert.ok(stale.html.includes("This record changed"));
      const invalid = await app.post(`/courses/${course}/edit`, "Save course", {
        ...courseInput,
        standard_price: "1.001",
      });
      assert.equal(invalid.response.status, 200);
      assert.equal((await details(course)).course.standard_price, "750000.10");
      const duplicate = await app.post(
        "/courses/new",
        "Create course",
        courseInput,
      );
      assert.equal(duplicate.response.status, 200);
      assert.ok(duplicate.html.includes("already in use"));
    },
  );
  await t.test(
    "real directory filters and archive/reactivate retain the course and audit trail",
    async () => {
      const filtered = await app.get(
        `/courses?q=Live+English&category=${category}&level=${level}&pricing_model=monthly&sort=price_desc`,
      );
      assert.ok(filtered.html.includes(`/courses/${course}`));
      assert.ok(
        !(
          await app.get("/courses?q=No-matching-academic-course")
        ).html.includes(`/courses/${course}`),
      );
      success(
        await app.post(`/courses/${course}`, "Archive course", {
          confirm: "on",
          reason: "Live archive",
        }),
      );
      assert.equal((await details(course)).course.is_active, false);
      assert.ok(
        (await app.get("/courses?status=inactive")).html.includes(
          `/courses/${course}`,
        ),
      );
      success(
        await app.post(`/courses/${course}`, "Reactivate course", {
          confirm: "on",
          reason: "Live reactivation",
        }),
      );
      const d = await details(course);
      assert.equal(d.course.is_active, true);
      assert.equal(d.history.total, 4);
    },
  );
  await t.test(
    "classroom forms create/edit/deactivate/reactivate real branch resources",
    async () => {
      const created = await app.post(
        "/classrooms/new",
        "Create classroom",
        roomInput,
      );
      success(created);
      room = /classrooms\/([0-9a-f-]{36})/.exec(
        created.response.headers.get("location"),
      )[1];
      success(
        await app.post(`/classrooms/${room}/edit`, "Save classroom", {
          ...roomInput,
          capacity: "15",
        }),
      );
      assert.equal((await roomDetails(room)).classroom.capacity, 15);
      success(
        await app.post(`/classrooms/${room}`, "Deactivate classroom", {
          confirm: "on",
          reason: "Maintenance",
        }),
      );
      assert.equal((await roomDetails(room)).classroom.is_active, false);
      success(
        await app.post(`/classrooms/${room}`, "Reactivate classroom", {
          confirm: "on",
        }),
      );
      hiddenRoom = await rpc(owner, "save_classroom", {
        p_tenant: tenant,
        p_id: null,
        p_request: randomUUID(),
        p_version: 0,
        p_data: { ...roomInput, name: "Secret second room", branch_id: second },
      });
      const filtered = await app.get(
        `/classrooms?branch=${branch}&sort=capacity_desc`,
      );
      assert.ok(filtered.html.includes(`/classrooms/${room}`));
      assert.ok(!filtered.html.includes("Secret second room"));
    },
  );
  await t.test(
    "manager is restricted to assigned classrooms; forged room, branch and tenant forms fail",
    async () => {
      const roles = await owner.client
        .from("business_roles")
        .select("id,system_key")
        .eq("tenant_id", tenant);
      assert.ifError(roles.error);
      for (const [account, key] of [
        [manager, "manager"],
        [teacher, "teacher"],
        [employee, "employee"],
      ])
        await rpc(owner, "assign_member_role", {
          p_tenant: tenant,
          p_user: account.id,
          p_role: roles.data.find((r) => r.system_key === key).id,
          p_branches: [branch],
        });
      assert.ok(
        (await managerApp.get(`/classrooms/${room}`)).html.includes(
          "Live Room 101",
        ),
      );
      assert.ok(
        !(await managerApp.get(`/classrooms/${hiddenRoom}`)).html.includes(
          "Secret second room",
        ),
      );
      const wrongBranch = await managerApp.post(
        "/classrooms/new",
        "Create classroom",
        { ...roomInput, name: "Forbidden room", branch_id: second },
      );
      assert.equal(wrongBranch.response.status, 200);
      const wrongId = await managerApp.post(
        `/classrooms/${room}/edit`,
        "Save classroom",
        { ...roomInput, classroom_id: hiddenRoom, capacity: "99" },
      );
      assert.equal(wrongId.response.status, 404);
      assert.equal((await roomDetails(hiddenRoom)).classroom.capacity, 12);
      const wrongTenant = await app.post(
        `/classrooms/${room}/edit`,
        "Save classroom",
        { ...roomInput, tenant_id: foreign, capacity: "99" },
      );
      assert.equal(wrongTenant.response.status, 200);
      assert.ok(wrongTenant.html.includes("Business changed"));
      assert.equal((await roomDetails(room)).classroom.capacity, 15);
      assert.ok(
        (
          await manager.client.rpc("save_course", {
            p_tenant: tenant,
            p_id: course,
            p_request: randomUUID(),
            p_version: 4,
            p_data: courseInput,
          })
        ).error,
      );
    },
  );
  await t.test(
    "teacher can read shared academic metadata without mutation, history, finance or salary access",
    async () => {
      const visible = await teacherApp.get(`/courses/${course}`);
      assert.equal(visible.response.status, 200);
      assert.ok(visible.html.includes("Live English A1"));
      assert.ok(!visible.html.includes("Edit course"));
      assert.ok(!visible.html.includes("Live archive"));
      assert.ok(
        !(await teacherApp.get(`/classrooms/${hiddenRoom}`)).html.includes(
          "Secret second room",
        ),
      );
      assert.ok(
        !(await teacherApp.get(`/courses/${course}/edit`)).html.includes(
          "Save course",
        ),
      );
      assert.ok(
        (
          await teacher.client.rpc("save_classroom", {
            p_tenant: tenant,
            p_id: room,
            p_request: randomUUID(),
            p_version: 4,
            p_data: roomInput,
          })
        ).error,
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
      assert.ok(
        (
          await employee.client.rpc("course_details", {
            p_tenant: tenant,
            p_course: course,
          })
        ).error,
      );
    },
  );
  await t.test(
    "foreign businesses, manipulated IDs and subjectless/anonymous requests cannot read academic records",
    async () => {
      assert.ok(
        (
          await other.client.rpc("course_details", {
            p_tenant: tenant,
            p_course: course,
          })
        ).error,
      );
      assert.ok(
        (
          await other.client.rpc("course_details", {
            p_tenant: foreign,
            p_course: course,
          })
        ).error,
      );
      assert.ok(
        (
          await other.client.rpc("classroom_details", {
            p_tenant: tenant,
            p_classroom: room,
          })
        ).error,
      );
      const metadata = await other.client
        .from("courses")
        .select("id,name")
        .eq("tenant_id", tenant);
      assert.ifError(metadata.error);
      assert.deepEqual(metadata.data, []);
      const response = await fetch("http://127.0.0.1:3000/courses", {
        redirect: "manual",
      });
      assert.ok([303, 307].includes(response.status));
      assert.match(response.headers.get("location"), /login/);
      const anonymous = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/course_details`,
        {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_tenant: tenant, p_course: course }),
        },
      );
      assert.ok([401, 403].includes(anonymous.status));
    },
  );
  await t.test(
    "simultaneous identical creates are idempotent and competing classroom edits cannot overwrite each other",
    async () => {
      const args = {
        p_tenant: tenant,
        p_id: null,
        p_request: randomUUID(),
        p_version: 0,
        p_data: {
          ...courseInput,
          code: "CONCURRENT",
          name: "Concurrent catalog course",
          standard_price: "0.00",
        },
      };
      const results = await Promise.all([
        owner.client.rpc("save_course", args),
        owner.client.rpc("save_course", args),
      ]);
      results.forEach((r) => assert.ifError(r.error));
      assert.equal(results[0].data, results[1].data);
      const before = (await roomDetails(room)).classroom.version;
      const updates = await Promise.all(
        ["21", "22"].map((capacity) =>
          owner.client.rpc("save_classroom", {
            p_tenant: tenant,
            p_id: room,
            p_request: randomUUID(),
            p_version: before,
            p_data: { ...roomInput, capacity },
          }),
        ),
      );
      assert.equal(updates.filter((r) => !r.error).length, 1);
      assert.equal(updates.find((r) => r.error).error.code, "40001");
      assert.equal((await roomDetails(room)).classroom.version, before + 1);
    },
  );
});
