import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./helpers/database.mjs";

test("invoice upgrade preserves populated cash ledger and audit history", async (t) => {
  const db = await createTestDatabase({ migrationCount: 16 });
  t.after(() => db.close());
  await db.exec(
    "insert into auth.users(id,email) values('84000000-0000-0000-0000-000000000001','invoice-upgrade@example.test');set request.jwt.claim.sub='84000000-0000-0000-0000-000000000001'",
  );
  const tenant = (
    await db.query("select public.create_business('Pre-invoice business') id")
  ).rows[0].id;
  const branch = (await db.query("select id from public.branches")).rows[0].id;
  const box = (
    await db.query("select public.save_cashbox($1,null,$2,$3) id", [
      tenant,
      randomUUID(),
      { branch_id: branch, name: "Preserved cashbox", cashbox_type: "cash" },
    ])
  ).rows[0].id;
  await db.query(
    "select public.post_cashbox_entry($1,$2,$3,'opening_balance','9007199254740993.01','Existing exact balance')",
    [tenant, box, randomUUID()],
  );
  const before = (
    await db.query("select public.cashbox_details($1,$2) value", [tenant, box])
  ).rows[0].value;
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .slice(16))
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  const after = (
    await db.query("select public.cashbox_details($1,$2) value", [tenant, box])
  ).rows[0].value;
  assert.deepEqual(after, before);
  assert.equal(after.balance, "9007199254740993.01");
  assert.equal(
    (await db.query("select count(*)::int n from public.invoices")).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.business_role_permissions p join public.business_roles r on r.tenant_id=p.tenant_id and r.id=p.role_id where r.system_key in ('owner','admin') and p.permission in ('invoices.view','invoices.create','invoices.issue','invoices.void','debts.view')",
      )
    ).rows[0].n,
    10,
  );
});
