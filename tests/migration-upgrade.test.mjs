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
