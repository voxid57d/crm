import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";
for (const phase of ["7A", "7B", "7C", "7D", "8A"])
  test(`${phase} populated upgrade preserves student, guardians, conversion, salary and posted financial history`, async (t) => {
    const directory = new URL("../supabase/migrations/", import.meta.url),
      files = (await readdir(directory))
        .filter(
          (f) =>
            f.endsWith(".sql") &&
            (phase === "8A"
              ? f < "20261026000800"
              : f <
                (phase === "7D"
                  ? "20261026000400"
                  : phase === "7C"
                    ? "20261026000100"
                    : phase === "7B"
                      ? "20261025000900"
                      : "20261025000400")),
        )
        .sort(),
      boundary = files.findIndex((f) =>
        f.startsWith(
          phase === "7A"
            ? "20261025000100"
            : phase === "7B"
              ? "20261025000400"
              : phase === "7C"
                ? "20261025000900"
                : phase === "7D"
                  ? "20261026000100"
                  : "20261026000400",
        ),
      );
    assert.ok(boundary > 0);
    const db = await createTestDatabase({ migrationCount: boundary });
    t.after(() => db.close());
    const rows = async (q, args = []) => (await db.query(q, args)).rows,
      uid = "90000000-0000-0000-0000-000000000001";
    await rows("insert into auth.users(id,email) values($1,$2)", [
      uid,
      "academic-upgrade@example.test",
    ]);
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec("set role authenticated");
    const tenant = (
        await rows("select public.create_business('Pre-LMS business') id")
      )[0].id,
      branch = (await rows("select id from public.branches"))[0].id;
    const student = (
      await rows("select public.save_student($1,$2,null,$3,$4,$5) id", [
        tenant,
        randomUUID(),
        { first_name: "Preserved student", phone: "998907771111" },
        { student_identifier: "PRESERVED-STUDENT" },
        [branch],
      ])
    )[0].id;
    await rows(
      "select public.save_student_guardian($1,$2,null,'Preserved parent','998907771112','','Parent',true)",
      [tenant, student],
    );
    const employee = (
      await rows(
        "select public.save_employee($1,null,'Preserved teacher','','','Teacher','active','2026-10-22','',array[$2]::uuid[]) id",
        [tenant, branch],
      )
    )[0].id;
    await rows(
      "select public.save_employee_salary($1,$2,'fixed_monthly','9007199254740993.12','','','','','UZS','Existing salary configuration')",
      [tenant, employee],
    );
    const pipeline = (
        await rows(
          "select id from public.sales_pipelines where tenant_id=$1 and is_default",
          [tenant],
        )
      )[0].id,
      stage = (
        await rows(
          "select id from public.sales_stages where tenant_id=$1 and outcome='open' order by position limit 1",
          [tenant],
        )
      )[0].id;
    const lead = (
      await rows("select public.save_lead($1,null,$2) id", [
        tenant,
        {
          branch_id: branch,
          pipeline_id: pipeline,
          stage_id: stage,
          first_name: "Preserved enquiry",
          phone: "998907771111",
        },
      ])
    )[0].id;
    await rows("select public.convert_lead_to_student($1,$2,$3)", [
      tenant,
      lead,
      student,
    ]);
    const today = (
        await rows("select (now() at time zone 'Asia/Tashkent')::date::text d")
      )[0].d,
      invoice = (
        await rows("select public.save_invoice_draft($1,null,$2,0,$3,$4) id", [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            customer_id: student,
            issue_date: today,
            due_date: today,
            discount_amount: "0",
          },
          [
            {
              description: "Preserved invoice",
              quantity: "1",
              unit_price: "100",
              discount_amount: "0",
            },
          ],
        ])
      )[0].id;
    await rows("select public.transition_invoice($1,$2,$3,1,'issue')", [
      tenant,
      invoice,
      randomUUID(),
    ]);
    const box = (
      await rows("select public.save_cashbox($1,null,$2,$3) id", [
        tenant,
        randomUUID(),
        { branch_id: branch, name: "Preserved drawer", cashbox_type: "cash" },
      ])
    )[0].id;
    await rows("select public.post_payment($1,$2,$3,$4)", [
      tenant,
      randomUUID(),
      {
        branch_id: branch,
        customer_id: student,
        cashbox_id: box,
        amount: "60.10",
        paid_at: today + "T00:00:00+05:00",
        method: "cash",
      },
      [{ invoice_id: invoice, amount: "40" }],
    ]);
    const snapshot = async () => {
      await db.exec("reset role");
      const result = {};
      for (const table of [
        "customers",
        "student_profiles",
        "student_guardians",
        "guardians",
        "leads",
        "employees",
        "employee_salary_settings",
        "financial_transactions",
        "financial_ledger_entries",
        "financial_audit_events",
        "payments",
        "payment_allocations",
        "invoices",
        "invoice_items",
        "invoice_receivable_entries",
      ])
        result[table] = (
          await rows(
            `select md5(coalesce(string_agg(row_to_json(x)::text,'' order by row_to_json(x)::text),'')) hash from public.${table} x`,
          )
        )[0].hash;
      await db.exec("set role authenticated");
      return result;
    };
    let priorGroup, priorCourse, priorEnrollment, priorAcademic, priorLesson;
    const academicSnapshot = async () => {
      await db.exec("reset role");
      const result = {};
      for (const [table, key, id] of [
        ["study_groups", "id", priorGroup],
        ["courses", "id", priorCourse],
        ["student_enrollments", "id", priorEnrollment],
        ...(priorLesson ? [["lessons", "id", priorLesson]] : []),
      ])
        result[table] = (
          await rows(
            `select row_to_json(x) d from public.${table} x where ${key}=$1`,
            [id],
          )
        )[0].d;
      await db.exec("set role authenticated");
      return result;
    };
    if (["7C", "7D", "8A"].includes(phase)) {
      priorCourse = (
        await rows("select public.save_course($1,null,$2,0,$3) id", [
          tenant,
          randomUUID(),
          {
            name: "Existing 7B course",
            standard_price: "750000.10",
            pricing_model: "monthly",
          },
        ])
      )[0].id;
      priorGroup = (
        await rows("select public.save_study_group($1,null,$2,0,$3) id", [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            course_id: priorCourse,
            name: "Existing 7B group",
            start_date: today,
            capacity: "12",
          },
        ])
      )[0].id;
      await db.exec("reset role");
      await rows("update public.employees set user_id=$1 where id=$2", [
        uid,
        employee,
      ]);
      await db.exec("set role authenticated");
      await rows("select public.set_group_teachers($1,$2,$3,1,$4,$5)", [
        tenant,
        priorGroup,
        randomUUID(),
        [employee],
        employee,
      ]);
      await rows(
        "select public.change_group_status($1,$2,$3,2,'active','Existing teaching')",
        [tenant, priorGroup, randomUUID()],
      );
      priorEnrollment = (
        await rows(
          "select public.create_student_enrollment($1,$2,$3,$4,$5) id",
          [
            tenant,
            priorGroup,
            student,
            randomUUID(),
            {
              enrollment_date: today,
              effective_start_date: today,
              agreed_price: "750000.10",
              pricing_model: "monthly",
              status: "active",
            },
          ],
        )
      )[0].id;
      if (["7D", "8A"].includes(phase))
        priorLesson = (
          await rows(
            "select public.save_lesson($1,$2,null,$3,0,$4,'Existing scheduled lesson') id",
            [
              tenant,
              priorGroup,
              randomUUID(),
              {
                local_start:
                  (await rows("select ($1::date+1)::text d", [today]))[0].d +
                  "T10:00",
                local_end:
                  (await rows("select ($1::date+1)::text d", [today]))[0].d +
                  "T11:00",
                timezone: "Asia/Tashkent",
                teacher_id: employee,
                title: "Original retained lesson",
              },
            ],
          )
        )[0].id;
      priorAcademic = await academicSnapshot();
    }
    const before = await snapshot(),
      finance = (
        await rows("select public.customer_financial_profile($1,$2) v", [
          tenant,
          student,
        ])
      )[0].v;
    await db.exec("reset role");
    for (const file of files.slice(boundary))
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    await db.exec("set role authenticated");
    assert.deepEqual(await snapshot(), before);
    if (phase === "8A") {
      assert.equal(
        (
          await rows(
            "select count(*)::integer n from public.lesson_attendance_sheets",
          )
        )[0].n,
        0,
      );
      const current = (
        await rows(
          "select public.save_lesson($1,$2,null,$3,0,$4,'Existing student attendance') id",
          [
            tenant,
            priorGroup,
            randomUUID(),
            {
              local_start: today + "T00:00",
              local_end: today + "T00:01",
              timezone: "Asia/Tashkent",
              teacher_id: employee,
              title: "Reviewed attendance after upgrade",
            },
          ],
        )
      )[0].id;
      await rows("select public.prepare_attendance_sheet($1,$2,$3)", [
        tenant,
        current,
        randomUUID(),
      ]);
      const attendance = (
        await rows("select public.attendance_sheet_details($1,$2) v", [
          tenant,
          current,
        ])
      )[0].v;
      assert.equal(attendance.rows[0].customer_id, student);
      assert.equal(attendance.rows[0].enrollment_id, priorEnrollment);
      assert.equal(attendance.rows[0].status, "unmarked");
      assert.equal(attendance.counts.absent, 0);
      assert.deepEqual(await academicSnapshot(), priorAcademic);
    }
    if (["7D", "8A"].includes(phase)) {
      const overview = (
        await rows("select public.student_academic_summary($1,$2) v", [
          tenant,
          student,
        ])
      )[0].v;
      assert.equal(overview.active_groups, 1);
      assert.equal(overview.invoices.total, 0);
      assert.equal(
        (
          await rows("select public.enrollment_billing_details($1,$2) v", [
            tenant,
            priorEnrollment,
          ])
        )[0].v.can_create,
        true,
      );
      assert.deepEqual(await academicSnapshot(), priorAcademic);
    }
    if (["7C", "7D", "8A"].includes(phase)) {
      assert.deepEqual(await academicSnapshot(), priorAcademic);
      const tomorrow = (await rows("select ($1::date+1)::text d", [today]))[0]
          .d,
        through = (await rows("select ($1::date+7)::text d", [today]))[0].d,
        weekday = (
          await rows("select extract(isodow from $1::date)::integer d", [
            tomorrow,
          ])
        )[0].d;
      await rows("select public.save_group_schedule($1,$2,null,$3,0,$4,$5)", [
        tenant,
        priorGroup,
        randomUUID(),
        {
          weekday: String(weekday),
          start_time: "14:00",
          end_time: "15:00",
          timezone: "Asia/Tashkent",
          effective_from: tomorrow,
          effective_to: through,
          teacher_id: employee,
        },
        "Preserve existing agreements",
      ]);
      const batch = (
        await rows("select public.generate_group_lessons($1,$2,$3,$4,$5) d", [
          tenant,
          priorGroup,
          randomUUID(),
          tomorrow,
          through,
        ])
      )[0].d;
      assert.equal(batch.created_count, 1);
      const lesson = (
        await rows("select public.save_lesson($1,$2,null,$3,0,$4,$5) id", [
          tenant,
          priorGroup,
          randomUUID(),
          {
            local_start: tomorrow + "T16:00",
            local_end: tomorrow + "T17:00",
            timezone: "Asia/Tashkent",
            teacher_id: employee,
            title: "Financial continuity lesson",
          },
          "Separate academic planning",
        ])
      )[0].id;
      await rows("select public.reschedule_lesson($1,$2,$3,1,$4,$5)", [
        tenant,
        lesson,
        randomUUID(),
        {
          local_start: tomorrow + "T17:00",
          local_end: tomorrow + "T18:00",
          timezone: "Asia/Tashkent",
          teacher_id: employee,
          title: "Retained reschedule",
        },
        "Preserve historical identities",
      ]);
      assert.deepEqual(await academicSnapshot(), priorAcademic);
      assert.deepEqual(await snapshot(), before);
    }
    assert.deepEqual(
      (
        await rows("select public.customer_financial_profile($1,$2) v", [
          tenant,
          student,
        ])
      )[0].v,
      finance,
    );
    const course = (
      await rows("select public.save_course($1,null,$2,0,$3) id", [
        tenant,
        randomUUID(),
        {
          name: "New academic catalog course",
          standard_price: "750000.10",
          pricing_model: "monthly",
        },
      ])
    )[0].id;
    await rows("select public.save_course($1,$2,$3,1,$4)", [
      tenant,
      course,
      randomUUID(),
      {
        name: "Updated catalog template",
        standard_price: "1000000.00",
        pricing_model: "fixed_course",
      },
    ]);
    await rows("select public.save_classroom($1,null,$2,0,$3)", [
      tenant,
      randomUUID(),
      { branch_id: branch, name: "Real classroom", capacity: "12" },
    ]);
    if (phase !== "7A") {
      const group = (
        await rows("select public.save_study_group($1,null,$2,0,$3) id", [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            course_id: course,
            name: "Upgrade group",
            start_date: today,
            capacity: "12",
          },
        ])
      )[0].id;
      const enrollment = (
        await rows(
          "select public.create_student_enrollment($1,$2,$3,$4,$5) id",
          [
            tenant,
            group,
            student,
            randomUUID(),
            {
              enrollment_date: today,
              effective_start_date: today,
              agreed_price: "750000.10",
              pricing_model: "monthly",
            },
          ],
        )
      )[0].id;
      assert.equal(
        (
          await rows("select public.student_enrollment_details($1,$2) v", [
            tenant,
            enrollment,
          ])
        )[0].v.enrollment.customer_id,
        student,
      );
      const target = (
        await rows("select public.save_study_group($1,null,$2,0,$3) id", [
          tenant,
          randomUUID(),
          {
            branch_id: branch,
            course_id: course,
            name: "Upgrade transfer destination",
            start_date: today,
            capacity: "12",
          },
        ])
      )[0].id;
      const moved = (
        await rows(
          "select public.transfer_student_enrollment($1,$2,$3,$4,1,$5,$6,$7) id",
          [
            tenant,
            enrollment,
            target,
            randomUUID(),
            today,
            { agreed_price: "800000.00", pricing_model: "monthly" },
            "Preserve posted financial history",
          ],
        )
      )[0].id;
      assert.equal(
        (
          await rows("select public.student_enrollment_details($1,$2) v", [
            tenant,
            moved,
          ])
        )[0].v.enrollment.customer_id,
        student,
      );
      assert.deepEqual(
        (
          await rows("select public.customer_financial_profile($1,$2) v", [
            tenant,
            student,
          ])
        )[0].v,
        finance,
      );
    }
    assert.deepEqual(await snapshot(), before);
    assert.equal(finance.summary.outstanding, "60.00");
    assert.equal(finance.payment_summary.credit, "20.10");
    assert.equal(
      (
        await rows("select public.get_employee_salary($1,$2) v", [
          tenant,
          employee,
        ])
      )[0].v.amount,
      "9007199254740993.12",
    );
    if (phase === "7A")
      assert.equal(
        (await rows("select to_regclass('public.student_enrollments') v"))[0].v,
        null,
      );
    if (["7A", "7B"].includes(phase))
      assert.equal(
        (await rows("select to_regclass('public.lessons') v"))[0].v,
        null,
      );
  });
