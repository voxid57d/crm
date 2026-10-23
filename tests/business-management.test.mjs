import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.mjs";

test("business onboarding, roles, branch scope, and profiles use the real migrations", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const user = (number) =>
    `30000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
  for (let number = 1; number <= 6; number++)
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)",
      [
        user(number),
        `user${number}@example.test`,
        { full_name: `User ${number}`, role: "owner", tenant_id: "forged" },
      ],
    );
  const asUser = async (number) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      number ? user(number) : "",
    ]);
    await db.exec("set role authenticated");
  };
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const createBusiness = async (name) =>
    (await query("select public.create_business($1) id", [name]))[0].id;
  const setMember = async (tenantId, number, role, branches, active = true) =>
    db.query("select public.set_business_member($1,$2,$3,$4,$5)", [
      tenantId,
      `user${number}@example.test`,
      role,
      branches,
      active,
    ]);
  let businessA, businessB, branchA1, branchA2, branchB;

  await t.test(
    "User A creates Business A with canonical owner, defaults, and first branch",
    async () => {
      await asUser(1);
      businessA = await createBusiness("Business A");
      const tenant = (await query("select * from public.tenants"))[0];
      assert.equal(tenant.owner_id, user(1));
      assert.equal(tenant.currency, "UZS");
      assert.equal(tenant.timezone, "Asia/Tashkent");
      assert.equal(
        (await query("select role from public.tenant_memberships"))[0].role,
        "owner",
      );
      branchA1 = (await query("select id from public.branches"))[0].id;
    },
  );
  await t.test(
    "failed onboarding rolls back business and owner membership together",
    async () => {
      await assert.rejects(
        db.query(
          "select public.create_business('Invalid','education','','','','')",
        ),
        /check constraint/,
      );
      assert.equal((await query("select * from public.tenants")).length, 1);
      assert.equal(
        (await query("select * from public.tenant_memberships")).length,
        1,
      );
    },
  );
  await t.test(
    "Owner creates, edits, deactivates, and reactivates a branch",
    async () => {
      branchA2 = (
        await query(
          "insert into public.branches(tenant_id,name,address,phone) values ($1,'Second branch','Tashkent','+998901234567') returning id",
          [businessA],
        )
      )[0].id;
      await query(
        "update public.branches set name='Renamed branch',is_active=false where id=$1 returning id",
        [branchA2],
      );
      assert.equal(
        (
          await query("select is_active from public.branches where id=$1", [
            branchA2,
          ])
        )[0].is_active,
        false,
      );
      await query("update public.branches set is_active=true where id=$1", [
        branchA2,
      ]);
      assert.equal((await query("select * from public.branches")).length, 2);
    },
  );
  await t.test(
    "User B creates Business B and cannot read or mutate Business A by changing IDs",
    async () => {
      await asUser(2);
      businessB = await createBusiness("Business B");
      branchB = (await query("select id from public.branches"))[0].id;
      assert.deepEqual(
        (await query("select id from public.tenants")).map((row) => row.id),
        [businessB],
      );
      assert.equal(
        (await query("select * from public.tenants where id=$1", [businessA]))
          .length,
        0,
      );
      assert.equal(
        (
          await query(
            "update public.tenants set name='Stolen' where id=$1 returning id",
            [businessA],
          )
        ).length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into public.branches(tenant_id,name) values ($1,'Foreign')",
          [businessA],
        ),
        /row-level security/,
      );
      await assert.rejects(
        setMember(businessA, 2, "admin", []),
        /Owner permission required/,
      );
      await assert.rejects(
        db.query("select * from public.list_business_members($1)", [businessA]),
        /Team access denied/,
      );
    },
  );
  await t.test(
    "User A cannot see Business B, even with a valid foreign branch UUID",
    async () => {
      await asUser(1);
      assert.equal(
        (await query("select * from public.tenants where id=$1", [businessB]))
          .length,
        0,
      );
      assert.equal(
        (await query("select * from public.branches where id=$1", [branchB]))
          .length,
        0,
      );
      await assert.rejects(
        db.query("update public.branches set tenant_id=$1 where id=$2", [
          businessB,
          branchA1,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        setMember(businessA, 3, "manager", [branchB]),
        /Branch does not belong/,
      );
    },
  );
  await t.test(
    "only Owner explicitly assigns registered members and branch roles",
    async () => {
      await setMember(businessA, 3, "manager", [branchA1]);
      await setMember(businessA, 4, "employee", [branchA1]);
      await setMember(businessA, 6, "admin", []);
      await assert.rejects(
        setMember(businessA, 1, "employee", [branchA1]),
        /Owner cannot be reassigned/,
      );
      await assert.rejects(
        setMember(businessA, 4, "owner", []),
        /Choose Admin/,
      );
      await assert.rejects(
        setMember(businessA, 4, "manager", []),
        /Assign at least one branch/,
      );
    },
  );
  await t.test(
    "Branch Manager manages assigned branch but cannot access another branch or business",
    async () => {
      await asUser(3);
      assert.deepEqual(
        (await query("select id from public.branches")).map((row) => row.id),
        [branchA1],
      );
      assert.equal(
        (
          await query(
            "update public.branches set address='Managed' where id=$1 returning id",
            [branchA1],
          )
        ).length,
        1,
      );
      assert.equal(
        (
          await query(
            "update public.branches set address='Stolen' where id=$1 returning id",
            [branchA2],
          )
        ).length,
        0,
      );
      assert.equal(
        (await query("select * from public.branches where id=$1", [branchB]))
          .length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into public.branches(tenant_id,name) values ($1,'Not allowed')",
          [businessA],
        ),
        /row-level security/,
      );
      await assert.rejects(
        setMember(businessA, 4, "admin", []),
        /Owner permission required/,
      );
    },
  );
  await t.test(
    "Employee cannot perform owner actions or promote themselves through metadata or direct DML",
    async () => {
      await asUser(4);
      assert.equal(
        (await query("select role from public.tenant_memberships"))[0].role,
        "employee",
      );
      assert.equal(
        (
          await query(
            "update public.branches set name='Forbidden' where id=$1 returning id",
            [branchA1],
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await query(
            "update public.tenants set name='Forbidden' where id=$1 returning id",
            [businessA],
          )
        ).length,
        0,
      );
      await assert.rejects(
        db.exec("update public.tenant_memberships set role='owner'"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "insert into public.tenant_memberships(tenant_id,user_id,role) values ($1,$2,'owner')",
          [businessB, user(4)],
        ),
        /permission denied/,
      );
      await assert.rejects(
        setMember(businessA, 4, "admin", []),
        /Owner permission required/,
      );
    },
  );
  await t.test(
    "deactivated branches are hidden from Employees; Managers can restore assigned branches",
    async () => {
      await asUser(3);
      await query("update public.branches set is_active=false where id=$1", [
        branchA1,
      ]);
      await asUser(4);
      assert.equal((await query("select * from public.branches")).length, 0);
      await asUser(3);
      assert.equal((await query("select * from public.branches")).length, 1);
      await query("update public.branches set is_active=true where id=$1", [
        branchA1,
      ]);
    },
  );
  await t.test(
    "Admin has business management access but cannot change memberships",
    async () => {
      await asUser(6);
      assert.equal((await query("select * from public.branches")).length, 2);
      await query(
        "update public.tenants set contact_email='center@example.test',currency='UZS' where id=$1",
        [businessA],
      );
      await assert.rejects(
        setMember(businessA, 4, "admin", []),
        /Owner permission required/,
      );
      await assert.rejects(
        db.query("update public.tenants set owner_id=$1 where id=$2", [
          user(6),
          businessA,
        ]),
        /permission denied/,
      );
    },
  );
  await t.test(
    "profiles are created automatically and are self-only",
    async () => {
      await asUser(4);
      assert.deepEqual(
        (await query("select id from public.profiles")).map((row) => row.id),
        [user(4)],
      );
      await query(
        "update public.profiles set full_name='Updated name' where id=$1",
        [user(4)],
      );
      assert.equal(
        (
          await query(
            "update public.profiles set full_name='Foreign' where id=$1 returning id",
            [user(1)],
          )
        ).length,
        0,
      );
      await assert.rejects(
        db.query("update public.profiles set id=$1", [user(1)]),
        /permission denied/,
      );
    },
  );
  await t.test(
    "unassigned outsider sees no business despite forged owner metadata",
    async () => {
      await asUser(5);
      assert.equal((await query("select * from public.tenants")).length, 0);
      assert.equal((await query("select * from public.branches")).length, 0);
      assert.equal(
        (await query("select * from public.tenant_memberships")).length,
        0,
      );
    },
  );
  await t.test(
    "suspended membership revokes current tenant and branch access",
    async () => {
      await asUser(1);
      await setMember(businessA, 4, "employee", [], false);
      await asUser(4);
      assert.equal((await query("select * from public.tenants")).length, 0);
      assert.equal((await query("select * from public.branches")).length, 0);
    },
  );
  await t.test(
    "explicit membership permits one user to belong to two independent businesses",
    async () => {
      await asUser(2);
      await setMember(businessB, 3, "employee", [branchB]);
      await asUser(3);
      assert.equal((await query("select * from public.tenants")).length, 2);
      assert.deepEqual(
        new Set(
          (await query("select id from public.branches")).map((row) => row.id),
        ),
        new Set([branchA1, branchB]),
      );
      assert.equal(
        (
          await query(
            "update public.branches set name='Forbidden' where id=$1 returning id",
            [branchB],
          )
        ).length,
        0,
      );
    },
  );
  await t.test(
    "Owners can create multiple businesses and never obtain platform administration",
    async () => {
      await asUser(1);
      await createBusiness("Another business");
      assert.equal((await query("select * from public.tenants")).length, 2);
      assert.equal(
        (
          await query(
            "select private.has_permission($1,'platform.admin') allowed",
            [businessA],
          )
        )[0].allowed,
        false,
      );
      await assert.rejects(
        db.exec(
          "insert into public.role_permissions values ('owner','platform.admin')",
        ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "database validates timezone and owner integrity independently of the frontend",
    async () => {
      await assert.rejects(
        db.query("update public.tenants set timezone='Not/AZone' where id=$1", [
          businessA,
        ]),
        /Invalid timezone/,
      );
      await db.exec("reset role");
      await assert.rejects(
        db.query(
          "update public.tenant_memberships set is_active=false where tenant_id=$1 and user_id=$2",
          [businessA, user(1)],
        ),
        /active Owner membership/,
      );
    },
  );
  await t.test(
    "no subject and anonymous clients cannot create businesses or read protected data",
    async () => {
      await asUser(null);
      assert.equal((await query("select * from public.tenants")).length, 0);
      await assert.rejects(
        db.query("select public.create_business('Anonymous')"),
        /Authentication required/,
      );
      await db.exec("reset role; set role anon");
      for (const table of [
        "tenants",
        "branches",
        "tenant_memberships",
        "branch_memberships",
        "profiles",
      ])
        await assert.rejects(
          db.exec(`select * from public.${table}`),
          /permission denied/,
        );
      await assert.rejects(
        db.query("select public.create_business('Anonymous')"),
        /permission denied/,
      );
    },
  );
});
