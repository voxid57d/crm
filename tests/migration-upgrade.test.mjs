import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.mjs";
import { readdir } from "node:fs/promises";

async function upgrade(db) {
  for (const file of [
    "20261022000200_employee_role.sql",
    "20261022000300_auth_business_management.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
}

test("sales upgrade preserves populated customer/student/guardian records and history", async (t) => {
  const db = await createTestDatabase({ migrationCount: 8 });
  t.after(() => db.close());
  await db.exec(
    "insert into auth.users(id,email) values('62000000-0000-0000-0000-000000000001','sales-upgrade@example.test'); set request.jwt.claim.sub='62000000-0000-0000-0000-000000000001'",
  );
  const tenant = (
    await db.query(
      "select public.create_business('Existing customer business') id",
    )
  ).rows[0].id;
  const branch = (await db.query("select id from public.branches")).rows[0].id;
  const customer = (
    await db.query("select public.save_customer($1,null,$2,$3,'{}',$4) id", [
      tenant,
      { first_name: "Existing student", phone: "99890123" },
      [branch],
      { student_identifier: "PRE-SALES", education_status: "active" },
    ])
  ).rows[0].id;
  await db.query(
    "select public.save_customer_note($1,$2,null,'Existing confidential note')",
    [tenant, customer],
  );
  await db.query(
    "select public.save_student_guardian($1,$2,null,'Existing parent','99890555','','Parent')",
    [tenant, customer],
  );
  const before = (
    await db.query(
      "select to_jsonb(c) row from public.customers c where id=$1",
      [customer],
    )
  ).rows[0].row;
  const activityCount = (
    await db.query("select count(*)::int n from public.customer_activities")
  ).rows[0].n;
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .slice(8))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(c) row from public.customers c where id=$1",
        [customer],
      )
    ).rows[0].row,
    before,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.customer_activities"))
      .rows[0].n,
    activityCount,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.student_guardians"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.leads")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.sales_stages")).rows[0]
      .n,
    9,
  );
});

test("customer upgrade preserves populated employees, exact salaries and membership roles", async (t) => {
  const db = await createTestDatabase({ migrationCount: 5 });
  t.after(() => db.close());
  await db.exec(
    "insert into auth.users(id,email) values('61000000-0000-0000-0000-000000000001','customer-upgrade@example.test'); set request.jwt.claim.sub='61000000-0000-0000-0000-000000000001'",
  );
  const tenant = (
    await db.query(
      "select public.create_business('Populated employee business') id",
    )
  ).rows[0].id;
  const branch = (await db.query("select id from public.branches")).rows[0].id;
  const employee = (
    await db.query(
      "select public.save_employee($1,null,'Existing employee','','','Teacher','active','2026-10-23','Preserved notes',$2) id",
      [tenant, [branch]],
    )
  ).rows[0].id;
  await db.query(
    "select public.save_employee_salary($1,$2,'fixed_monthly','9007199254740993.12','','','','','UZS','Initial settings')",
    [tenant, employee],
  );
  const before = (
    await db.query("select role_id from public.tenant_memberships")
  ).rows[0].role_id;
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .slice(5))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  assert.equal(
    (await db.query("select role_id from public.tenant_memberships")).rows[0]
      .role_id,
    before,
  );
  assert.equal(
    (
      await db.query("select notes from public.employees where id=$1", [
        employee,
      ])
    ).rows[0].notes,
    "Preserved notes",
  );
  assert.equal(
    (
      await db.query(
        "select public.get_employee_salary($1,$2)->>'amount' amount",
        [tenant, employee],
      )
    ).rows[0].amount,
    "9007199254740993.12",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.customer_statuses where tenant_id=$1",
        [tenant],
      )
    ).rows[0].n,
    5,
  );
  assert.equal(
    (
      await db.query(
        "select private.has_permission($1,'customers.manage_settings') allowed",
        [tenant],
      )
    ).rows[0].allowed,
    true,
  );
});

test("tenant-defined role upgrade preserves existing memberships and assigned branches", async (t) => {
  const db = await createTestDatabase({ migrationCount: 3 });
  t.after(() => db.close());
  await db.exec(
    "insert into auth.users(id,email) values ('60000000-0000-0000-0000-000000000001','upgrade-owner@example.test'),('60000000-0000-0000-0000-000000000002','upgrade-manager@example.test')",
  );
  await db.exec(
    "set request.jwt.claim.sub='60000000-0000-0000-0000-000000000001'",
  );
  const tenant = (
    await db.query("select public.create_business('Existing business') id")
  ).rows[0].id;
  const branch = (await db.query("select id from public.branches")).rows[0].id;
  await db.query(
    "select public.set_business_member($1,'upgrade-manager@example.test','manager',$2,true)",
    [tenant, [branch]],
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).sort().slice(3))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  assert.equal(
    (
      await db.query("select * from public.business_roles where tenant_id=$1", [
        tenant,
      ])
    ).rows.length,
    8,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.tenant_memberships where role_id is not null",
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (await db.query("select branch_id from public.branch_memberships")).rows[0]
      .branch_id,
    branch,
  );
  await db.exec(
    "set request.jwt.claim.sub='60000000-0000-0000-0000-000000000002';set role authenticated",
  );
  assert.equal(
    (
      await db.query(
        "select private.has_permission($1,'employees.view',$2) allowed",
        [tenant, branch],
      )
    ).rows[0].allowed,
    true,
  );
});

test("management migration preserves valid legacy records and backfills owner/profile data", async (t) => {
  const db = await createTestDatabase({ migrationCount: 1 });
  t.after(() => db.close());
  await db.exec(
    await readFile(new URL("./fixtures/access.sql", import.meta.url), "utf8"),
  );
  // The historical fixture's B account was an Admin; make it an explicit
  // active Owner before this upgrade, without altering application migration.
  await db.exec(
    "update public.tenant_memberships set role='owner' where tenant_id='10000000-0000-0000-0000-000000000002'",
  );
  const before = (
    await db.query(
      "select id,name,slug,created_at from public.tenants order by id",
    )
  ).rows;
  await upgrade(db);
  assert.deepEqual(
    (
      await db.query(
        "select id,name,slug,created_at from public.tenants order by id",
      )
    ).rows,
    before,
  );
  assert.equal(
    (await db.query("select * from public.branches")).rows.length,
    3,
  );
  assert.equal(
    (await db.query("select * from public.profiles")).rows.length,
    4,
  );
  assert.equal(
    (await db.query("select owner_id from public.tenants order by id")).rows[0]
      .owner_id,
    "00000000-0000-0000-0000-000000000001",
  );
  assert.equal(
    (
      await db.query(
        "select role from public.tenant_memberships where user_id='00000000-0000-0000-0000-000000000002'",
      )
    ).rows[0].role,
    "teacher",
  );
});

test("upgrade refuses an ownerless legacy business instead of silently assigning ownership", async (t) => {
  const db = await createTestDatabase({ migrationCount: 1 });
  t.after(() => db.close());
  await db.exec(
    "insert into public.tenants(name,slug) values ('Legacy business','legacy-business')",
  );
  await assert.rejects(upgrade(db), /exactly one active owner/);
  assert.equal(
    (await db.query("select name from public.tenants")).rows[0].name,
    "Legacy business",
  );
});
