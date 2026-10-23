import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Executes the actual migration in embedded PostgreSQL. Auth is reduced to the
// JWT subject contract; this does not replace Docker/Supabase integration tests.
test("PostgreSQL enforces tenant, branch, and permission boundaries", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022000100_tenancy_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(new URL("./fixtures/access.sql", import.meta.url), "utf8"),
  );
  const tenantA = "10000000-0000-0000-0000-000000000001";
  const tenantB = "10000000-0000-0000-0000-000000000002";
  const branchB = "20000000-0000-0000-0000-000000000003";
  const asUser = async (number) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`,
    ]);
    await db.exec("set role authenticated");
  };
  const rows = async (sql) => (await db.query(sql)).rows;
  await t.test("owner sees only own tenant and all its branches", async () => {
    await asUser(1);
    assert.deepEqual(
      (await rows("select id from public.tenants")).map((r) => r.id),
      [tenantA],
    );
    assert.equal((await rows("select * from public.branches")).length, 2);
    assert.equal(
      (await rows(`select * from public.tenants where id = '${tenantB}'`))
        .length,
      0,
    );
  });
  await t.test(
    "teacher sees only assigned branch and own membership",
    async () => {
      await asUser(2);
      assert.deepEqual(
        (await rows("select name from public.branches")).map((r) => r.name),
        ["A1"],
      );
      assert.equal(
        (await rows("select * from public.tenant_memberships")).length,
        1,
      );
    },
  );
  await t.test(
    "teacher cannot create branches or promote their role",
    async () => {
      await assert.rejects(
        db.query(
          `insert into public.branches(tenant_id, name) values ('${tenantA}', 'Unauthorized')`,
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.exec("update public.tenant_memberships set role = 'owner'"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec(
          "insert into public.role_permissions values ('teacher', 'tenant.update')",
        ),
        /permission denied/,
      );
      assert.equal(
        (
          await rows(
            `update public.tenants set name = 'Unauthorized' where id = '${tenantA}' returning id`,
          )
        ).length,
        0,
      );
    },
  );
  await t.test(
    "other-tenant admin can write own branches but cannot cross tenants",
    async () => {
      await asUser(3);
      assert.deepEqual(
        (await rows("select id from public.tenants")).map((r) => r.id),
        [tenantB],
      );
      await assert.rejects(
        db.query(
          `insert into public.branches(tenant_id, name) values ('${tenantA}', 'Cross tenant')`,
        ),
        /row-level security/,
      );
      await db.query(
        `insert into public.branches(tenant_id, name) values ('${tenantB}', 'B2')`,
      );
      assert.equal((await rows("select * from public.branches")).length, 2);
      await assert.rejects(
        db.exec(
          `update public.branches set tenant_id = '${tenantA}' where id = '${branchB}'`,
        ),
        /permission denied/,
      );
      assert.equal(
        (
          await rows(
            `update public.tenants set name = 'Cross tenant' where id = '${tenantA}' returning id`,
          )
        ).length,
        0,
      );
    },
  );
  await t.test(
    "suspended owner immediately loses tenant and branch access",
    async () => {
      await asUser(4);
      assert.equal((await rows("select * from public.tenants")).length, 0);
      assert.equal((await rows("select * from public.branches")).length, 0);
      assert.equal(
        (await rows("select * from public.tenant_memberships")).length,
        0,
      );
    },
  );
  await t.test(
    "composite foreign keys reject cross-tenant branch assignments",
    async () => {
      await db.exec("reset role");
      await assert.rejects(
        db.query(
          `insert into public.branch_memberships(tenant_id, branch_id, user_id) values ('${tenantA}', '${branchB}', '00000000-0000-0000-0000-000000000002')`,
        ),
        /foreign key/,
      );
    },
  );
  await t.test("an authenticated outsider sees no tenant records", async () => {
    await asUser(99);
    for (const table of [
      "tenants",
      "branches",
      "tenant_memberships",
      "branch_memberships",
    ]) {
      assert.equal((await rows(`select * from public.${table}`)).length, 0);
    }
  });
  await t.test("anonymous role has no table or helper access", async () => {
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.exec("select * from public.tenants"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`select private.has_permission('${tenantA}', 'tenant.read')`),
      /permission denied/,
    );
  });
});
