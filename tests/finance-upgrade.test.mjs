import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.mjs";

test("finance upgrade preserves populated sales/customer identities and existing custom role grants", async (t) => {
  const db = await createTestDatabase({ migrationCount: 13 });
  t.after(() => db.close());
  await db.exec(
    "insert into auth.users(id,email) values('82000000-0000-0000-0000-000000000001','finance-upgrade@example.test');set request.jwt.claim.sub='82000000-0000-0000-0000-000000000001';",
  );
  const tenant = (
    await db.query("select public.create_business('Before finance') id")
  ).rows[0].id;
  const branch = (await db.query("select id from public.branches")).rows[0].id;
  const customer = (
    await db.query("select public.save_customer($1,null,$2,$3) id", [
      tenant,
      { first_name: "Existing financial contact", phone: "998901234" },
      [branch],
    ])
  ).rows[0].id;
  const pipeline = (await db.query("select id from public.sales_pipelines"))
    .rows[0].id;
  const stage = (
    await db.query(
      "select id from public.sales_stages where outcome='open' order by position limit 1",
    )
  ).rows[0].id;
  const lead = (
    await db.query("select public.save_lead($1,null,$2) id", [
      tenant,
      {
        branch_id: branch,
        pipeline_id: pipeline,
        stage_id: stage,
        first_name: "Existing lead",
        phone: "998907890",
      },
    ])
  ).rows[0].id;
  const before = (
    await db.query("select to_jsonb(l) value from public.leads l where id=$1", [
      lead,
    ])
  ).rows[0].value;
  const role = (
    await db.query(
      "insert into public.business_roles(tenant_id,name,scope) values($1,'Prior custom role','branch') returning id",
      [tenant],
    )
  ).rows[0].id;
  await db.query(
    "insert into public.business_role_permissions values($1,$2,'customers.view')",
    [tenant, role],
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .slice(13))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(l) value from public.leads l where id=$1",
        [lead],
      )
    ).rows[0].value,
    before,
  );
  assert.equal(
    (await db.query("select id from public.customers where id=$1", [customer]))
      .rows[0].id,
    customer,
  );
  assert.deepEqual(
    (
      await db.query(
        "select permission from public.business_role_permissions where role_id=$1",
        [role],
      )
    ).rows.map((r) => r.permission),
    ["customers.view"],
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.cashboxes")).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.business_role_permissions p join public.business_roles r on r.id=p.role_id where r.system_key in ('owner','admin') and p.permission in ('cashboxes.adjust','finance.audit.view')",
      )
    ).rows[0].n,
    4,
  );
});
