import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";

test("employees, dynamic roles, invitations and confidential exact salary settings", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const uid = (n) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  for (let n = 1; n <= 6; n++)
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      uid(n),
      `employee${n}@example.test`,
    ]);
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      n ? uid(n) : "",
    ]);
    await db.exec("set role authenticated");
  };
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const role = async (tenant, key) =>
    (
      await rows(
        "select id from public.business_roles where tenant_id=$1 and system_key=$2",
        [tenant, key],
      )
    )[0].id;
  const save = async (
    tenant,
    id,
    name,
    branches,
    status = "active",
    email = "",
  ) =>
    (
      await rows(
        "select public.save_employee($1,$2,$3,'', $4,'Teacher',$5,'2026-10-22','Notes',$6) id",
        [tenant, id, name, email, status, branches],
      )
    )[0].id;
  const salary = (
    tenant,
    id,
    type = "fixed_monthly",
    amount = "9007199254740993.12",
    percentage = "",
    bonus = "",
    bonusPercent = "",
    basis = "",
  ) =>
    db.query(
      "select public.save_employee_salary($1,$2,$3,$4,$5,$6,$7,$8,'UZS','Reviewed compensation')",
      [tenant, id, type, amount, percentage, bonus, bonusPercent, basis],
    );
  await as(1);
  const a = (await rows("select public.create_business('A') id"))[0].id;
  const a1 = (await rows("select id from public.branches"))[0].id;
  const a2 = (
    await rows(
      "insert into public.branches(tenant_id,name) values($1,'Second') returning id",
      [a],
    )
  )[0].id;
  const employeeRole = await role(a, "employee"),
    managerRole = await role(a, "manager");
  await as(2);
  const b = (await rows("select public.create_business('B') id"))[0].id;
  const b1 = (await rows("select id from public.branches"))[0].id;
  await as(1);
  let e, shared, token;
  await t.test(
    "Owner creates offline employees, multi-branch assignments and preserves modified records",
    async () => {
      e = await save(
        a,
        null,
        "Offline record",
        [a1],
        "active",
        "employee4@example.test",
      );
      shared = await save(a, null, "Shared record", [a1, a2]);
      assert.equal(
        (await rows("select user_id from public.employees where id=$1", [e]))[0]
          .user_id,
        null,
      );
      await save(
        a,
        e,
        "Updated name",
        [a1],
        "active",
        "employee4@example.test",
      );
      assert.equal(
        (
          await rows("select full_name from public.employees where id=$1", [e])
        )[0].full_name,
        "Updated name",
      );
      assert.equal(
        (
          await rows(
            "select * from public.employee_branches where employee_id=$1",
            [shared],
          )
        ).length,
        2,
      );
    },
  );
  await t.test(
    "cross-tenant reads, updates and forged branch assignments are denied",
    async () => {
      await as(2);
      assert.equal(
        (await rows("select * from public.employees where id=$1", [e])).length,
        0,
      );
      await assert.rejects(save(a, e, "Stolen", [a1]), /denied/);
      await as(1);
      await assert.rejects(
        save(a, null, "Foreign branch", [b1]),
        /Branch does not belong/,
      );
    },
  );
  await t.test(
    "Manager sees only fully covered records and cannot read salary data",
    async () => {
      await db.query(
        "select public.assign_member_role($1,$2,$3,$4,'{}',true)",
        [a, uid(3), managerRole, [a1]],
      );
      await as(3);
      assert.deepEqual(
        (await rows("select id from public.employees")).map((r) => r.id),
        [e],
      );
      await save(
        a,
        e,
        "Manager edit",
        [a1],
        "active",
        "employee4@example.test",
      );
      await assert.rejects(
        save(a, shared, "Unauthorized shared edit", [a1]),
        /denied/,
      );
      await assert.rejects(
        db.query("select public.get_employee_salary($1,$2)", [a, e]),
        /Salary access denied/,
      );
      await assert.rejects(
        db.exec("select * from public.employee_salary_settings"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("select * from public.employee_salary_history"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "custom roles use different permissions in different branches without union leakage",
    async () => {
      await as(1);
      const viewer = (
        await rows(
          "select public.save_business_role($1,null,'HR Viewer','branch',array['employees.view','branches.view']) id",
          [a],
        )
      )[0].id;
      await db.query("select public.assign_member_role($1,$2,$3,$4,$5,true)", [
        a,
        uid(3),
        managerRole,
        [a1, a2],
        { [a2]: viewer },
      ]);
      await as(3);
      assert.equal((await rows("select * from public.employees")).length, 2);
      await assert.rejects(
        save(a, shared, "Needs both branches", [a1, a2]),
        /Employee update denied/,
      );
      assert.equal(
        (
          await rows(
            "select private.has_permission($1,'employees.update',$2) allowed",
            [a, a1],
          )
        )[0].allowed,
        true,
      );
      assert.equal(
        (
          await rows(
            "select private.has_permission($1,'employees.update',$2) allowed",
            [a, a2],
          )
        )[0].allowed,
        false,
      );
      await assert.rejects(
        db.query(
          "select public.save_business_role($1,null,'Escalation','business',array['roles.manage'])",
          [a],
        ),
        /denied/,
      );
      await assert.rejects(
        db.query("select public.assign_member_role($1,$2,$3,$4,'{}',true)", [
          a,
          uid(3),
          employeeRole,
          [a1],
        ]),
        /denied/,
      );
    },
  );
  await t.test(
    "salary inputs remain exact and every change has immutable history",
    async () => {
      await as(1);
      await salary(a, e);
      let config = (
        await rows("select public.get_employee_salary($1,$2) value", [a, e])
      )[0].value;
      assert.equal(config.amount, "9007199254740993.12");
      await salary(a, e, "hourly", "125000.25");
      await salary(a, e, "per_lesson", "75000.00");
      await salary(
        a,
        e,
        "percentage",
        "",
        "12.3456",
        "",
        "",
        "Collected lesson revenue",
      );
      await salary(
        a,
        e,
        "base_bonus",
        "1000000.00",
        "",
        "50000.00",
        "2.5000",
        "Approved monthly targets",
      );
      const history = await rows("select * from public.salary_history($1,$2)", [
        a,
        e,
      ]);
      assert.equal(history.length, 5);
      assert.ok(history.every((event) => event.changed_by === uid(1)));
      assert.ok(
        history.some(
          (event) => event.new_settings.amount === "9007199254740993.12",
        ),
      );
      await assert.rejects(
        salary(a, e, "fixed_monthly", "1.234"),
        /Invalid exact amount/,
      );
      await assert.rejects(
        salary(a, e, "percentage", "", "101", "", "", "Revenue"),
        /check constraint/,
      );
      await assert.rejects(
        db.exec("update public.employee_salary_history set reason='Tampered'"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "salary permission is checked across every branch, not from another branch",
    async () => {
      const payroll = (
        await rows(
          "select public.save_business_role($1,null,'Payroll Reader','branch',array['employees.view','branches.view','salaries.view']) id",
          [a],
        )
      )[0].id;
      await db.query("select public.assign_member_role($1,$2,$3,$4,$5,true)", [
        a,
        uid(3),
        managerRole,
        [a1, a2],
        { [a1]: payroll },
      ]);
      await as(3);
      await rows("select public.get_employee_salary($1,$2)", [a, e]);
      await assert.rejects(
        db.query("select public.get_employee_salary($1,$2)", [a, shared]),
        /Salary access denied/,
      );
      await assert.rejects(
        salary(a, e, "hourly", "1"),
        /Salary management denied/,
      );
    },
  );
  await t.test(
    "only Owner creates invitations; token is hashed and email-bound",
    async () => {
      await assert.rejects(
        db.query("select public.create_employee_invitation($1,$2,$3)", [
          a,
          e,
          employeeRole,
        ]),
        /Only Owner/,
      );
      await as(1);
      token = (
        await rows("select public.create_employee_invitation($1,$2,$3) token", [
          a,
          e,
          employeeRole,
        ])
      )[0].token;
      assert.match(token, /^[0-9a-f]{64}$/);
      await db.exec("reset role");
      const stored = (
        await rows(
          "select token_hash from public.employee_invitations where employee_id=$1",
          [e],
        )
      )[0].token_hash;
      assert.notEqual(stored, token);
      await as(5);
      await assert.rejects(
        db.query("select public.accept_employee_invitation($1)", [token]),
        /email does not match/,
      );
      await as(4);
      assert.equal(
        (
          await rows("select public.preview_employee_invitation($1) value", [
            token,
          ])
        )[0].value.employee,
        "Manager edit",
      );
      await rows("select public.accept_employee_invitation($1)", [token]);
      await assert.rejects(
        db.query("select public.accept_employee_invitation($1)", [token]),
        /Invitation unavailable/,
      );
      await db.exec("reset role");
      assert.equal(
        (await rows("select user_id from public.employees where id=$1", [e]))[0]
          .user_id,
        uid(4),
      );
    },
  );
  await t.test(
    "employee cannot change own role; deactivation immediately revokes business access",
    async () => {
      await as(4);
      assert.equal((await rows("select * from public.tenants")).length, 1);
      await assert.rejects(
        db.query("select public.assign_member_role($1,$2,$3,$4,'{}',true)", [
          a,
          uid(4),
          managerRole,
          [a1],
        ]),
        /denied/,
      );
      await assert.rejects(
        db.exec("update public.tenant_memberships set role='owner'"),
        /permission denied/,
      );
      await as(1);
      await save(
        a,
        e,
        "Manager edit",
        [a1],
        "inactive",
        "employee4@example.test",
      );
      await as(4);
      assert.equal((await rows("select * from public.tenants")).length, 0);
      assert.equal((await rows("select * from public.branches")).length, 0);
      await as(1);
      await save(
        a,
        e,
        "Manager edit",
        [a1],
        "active",
        "employee4@example.test",
      );
    },
  );
  await t.test(
    "one Auth account can link employee profiles in separate businesses",
    async () => {
      await as(2);
      const record = await save(
        b,
        null,
        "Same person at B",
        [b1],
        "active",
        "employee4@example.test",
      );
      const link = (
        await rows("select public.create_employee_invitation($1,$2,$3) token", [
          b,
          record,
          await role(b, "employee"),
        ])
      )[0].token;
      await as(4);
      await rows("select public.accept_employee_invitation($1)", [link]);
      assert.equal((await rows("select * from public.tenants")).length, 2);
      await as(1);
      await save(
        a,
        e,
        "Archived employee",
        [a1],
        "archived",
        "employee4@example.test",
      );
      await as(4);
      assert.deepEqual(
        (await rows("select id from public.tenants")).map((r) => r.id),
        [b],
      );
      await as(1);
      assert.equal(
        (await rows("select * from public.salary_history($1,$2)", [a, e]))
          .length,
        5,
      );
    },
  );
  await t.test(
    "expired, revoked and privilege-escalating invitations cannot be accepted",
    async () => {
      const candidate = await save(
        a,
        null,
        "Invite tests",
        [a1],
        "active",
        "employee6@example.test",
      );
      await assert.rejects(
        db.query("select public.create_employee_invitation($1,$2,$3)", [
          a,
          candidate,
          await role(a, "owner"),
        ]),
        /Owner role cannot/,
      );
      const revoked = (
        await rows("select public.create_employee_invitation($1,$2,$3) token", [
          a,
          candidate,
          employeeRole,
        ])
      )[0].token;
      await rows("select public.revoke_employee_invitation($1,$2)", [
        a,
        candidate,
      ]);
      await as(6);
      await assert.rejects(
        db.query("select public.accept_employee_invitation($1)", [revoked]),
        /Invitation unavailable/,
      );
      await as(1);
      const expired = (
        await rows("select public.create_employee_invitation($1,$2,$3) token", [
          a,
          candidate,
          employeeRole,
        ])
      )[0].token;
      await db.exec("reset role");
      await db.query(
        "update public.employee_invitations set expires_at=now()-interval '1 hour' where employee_id=$1 and revoked_at is null",
        [candidate],
      );
      await as(6);
      await assert.rejects(
        db.query("select public.accept_employee_invitation($1)", [expired]),
        /Invitation unavailable/,
      );
    },
  );
  await t.test(
    "archive permission works independently of general employee update",
    async () => {
      await as(1);
      const record = await save(a, null, "Archive-only test", [a1]);
      const archiveRole = (
        await rows(
          "select public.save_business_role($1,null,'HR Archiver','branch',array['employees.view','branches.view','employees.archive']) id",
          [a],
        )
      )[0].id;
      await db.query(
        "select public.assign_member_role($1,$2,$3,$4,'{}',true)",
        [a, uid(3), archiveRole, [a1]],
      );
      await as(3);
      await assert.rejects(
        save(a, record, "Unauthorized rename", [a1]),
        /Employee update denied/,
      );
      await rows("select public.archive_employee($1,$2)", [a, record]);
      assert.equal(
        (
          await rows("select status from public.employees where id=$1", [
            record,
          ])
        )[0].status,
        "archived",
      );
      assert.equal(
        (
          await rows(
            "select * from public.employee_branches where employee_id=$1",
            [record],
          )
        ).length,
        1,
      );
    },
  );
  await t.test(
    "custom role administrators cannot delegate a permission they do not hold",
    async () => {
      await as(1);
      const restricted = (
        await rows(
          "select public.save_business_role($1,null,'Restricted role administrator','business',array['roles.manage','employees.view','branches.view']) id",
          [a],
        )
      )[0].id;
      await db.query(
        "select public.assign_member_role($1,$2,$3,'{}','{}',true)",
        [a, uid(6), restricted],
      );
      await as(6);
      await assert.rejects(
        db.query(
          "select public.save_business_role($1,null,'Unauthorized payroll','business',array['salaries.view'])",
          [a],
        ),
        /Invalid or elevated/,
      );
      await assert.rejects(
        db.query("select public.assign_member_role($1,$2,$3,'{}','{}',true)", [
          a,
          uid(6),
          await role(a, "admin"),
        ]),
        /Cannot delegate/,
      );
      await rows(
        "select public.save_business_role($1,null,'Delegated viewer','branch',array['employees.view','branches.view'])",
        [a],
      );
    },
  );
  await t.test(
    "clearing optional salary configuration retains an audit record",
    async () => {
      await as(1);
      await salary(a, shared, "none", "");
      assert.equal(
        (
          await rows("select public.get_employee_salary($1,$2) value", [
            a,
            shared,
          ])
        )[0].value.salary_type,
        "none",
      );
      assert.equal(
        (await rows("select * from public.salary_history($1,$2)", [a, shared]))
          .length,
        1,
      );
    },
  );
  await t.test(
    "anonymous and other-tenant salary APIs remain denied",
    async () => {
      await as(2);
      await assert.rejects(
        db.query("select public.get_employee_salary($1,$2)", [a, e]),
        /Salary access denied/,
      );
      await db.exec("reset role; set role anon");
      await assert.rejects(
        db.exec("select * from public.employees"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.get_employee_salary($1,$2)", [a, e]),
        /permission denied/,
      );
    },
  );
});
