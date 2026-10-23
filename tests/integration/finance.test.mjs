import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { localAppOrigin } from "../../src/lib/validation.mjs";

test("real local finance forms, exact balances, concurrency and authorization", async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.ok(url && key, "Configure local Supabase first.");
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
  );
  assert.ok(!key.startsWith("sb_secret_"));
  if (key.split(".").length === 3)
    assert.equal(
      JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role,
      "anon",
    );
  const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL),
    suffix = randomUUID().slice(0, 8),
    accounts = [];
  for (let n = 0; n < 3; n++) {
    const cookies = new Map(),
      client = createServerClient(url, key, {
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: (updates) =>
            updates.forEach(({ name, value }) =>
              value ? cookies.set(name, value) : cookies.delete(name),
            ),
        },
      });
    const email = `finance-live-${suffix}-${n}@example.test`;
    const result = await client.auth.signUp({
      email,
      password: `Finance-live-${randomUUID()}!`,
      options: { data: { full_name: `Finance QA ${n}` } },
    });
    assert.ifError(result.error);
    assert.ok(result.data.session);
    accounts.push({ client, cookies, email, id: result.data.user.id });
  }
  const [owner, other, cashier] = accounts;
  const rpc = async (account, name, args) => {
    const result = await account.client.rpc(name, args);
    assert.ifError(result.error);
    return result.data;
  };
  const tenant = await rpc(owner, "create_business", {
    p_name: `Finance live A ${suffix}`,
  });
  const foreign = await rpc(other, "create_business", {
    p_name: `Finance live B ${suffix}`,
  });
  const branchResult = await owner.client
    .from("branches")
    .select("id")
    .eq("tenant_id", tenant)
    .single();
  assert.ifError(branchResult.error);
  const branch = branchResult.data.id;
  const secondResult = await owner.client
    .from("branches")
    .insert({ tenant_id: tenant, name: "Finance other branch" })
    .select("id")
    .single();
  assert.ifError(secondResult.error);
  const second = secondResult.data.id;
  const roleResult = await owner.client
    .from("business_roles")
    .select("id")
    .eq("tenant_id", tenant)
    .eq("system_key", "cashier")
    .single();
  assert.ifError(roleResult.error);
  const employee = await rpc(owner, "save_employee", {
    p_tenant: tenant,
    p_id: null,
    p_full_name: `Cashier ${suffix}`,
    p_phone: "",
    p_email: cashier.email,
    p_job_title: "Cashier",
    p_status: "active",
    p_start_date: "2026-10-23",
    p_notes: "Local finance fixture",
    p_branches: [branch],
  });
  const token = await rpc(owner, "create_employee_invitation", {
    p_tenant: tenant,
    p_employee: employee,
    p_role: roleResult.data.id,
  });
  await rpc(cashier, "accept_employee_invitation", { p_token: token });
  const cookie = (account) =>
    [...account.cookies, ["forma-tenant", tenant], ["forma-branch", branch]]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
  const get = async (path, account = owner) => {
    const response = await fetch(origin + path, {
      headers: { Cookie: cookie(account) },
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
    });
    return { response, html: await response.text() };
  };
  const decode = (v) =>
    v
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  const post = async (path, label, values, account = owner) => {
    const page = await get(path, account);
    assert.equal(page.response.status, 200);
    const form = (page.html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? []).find(
      (f) => f.includes(label),
    );
    assert.ok(form, `Rendered form: ${label}`);
    const body = new FormData();
    for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
      if (!/type="hidden"/.test(input)) continue;
      const name = /name="([^"]*)"/.exec(input)?.[1],
        value = /value="([^"]*)"/.exec(input)?.[1] ?? "";
      if (name) body.append(decode(name), decode(value));
    }
    assert.ok([...body.keys()].some((k) => k.startsWith("$ACTION_")));
    for (const [name, value] of Object.entries(values)) {
      body.delete(name);
      body.append(name, value);
    }
    const response = await fetch(origin + path, {
      method: "POST",
      body,
      headers: { Cookie: cookie(account), Origin: origin },
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
    });
    return { response, html: await response.text() };
  };
  const detail = (box) =>
    rpc(owner, "cashbox_details", { p_tenant: tenant, p_cashbox: box });
  const create = (scope) =>
    rpc(owner, "save_cashbox", {
      p_tenant: tenant,
      p_id: null,
      p_request: randomUUID(),
      p_data: {
        name: `Concurrency ${suffix}`,
        branch_id: scope,
        cashbox_type: "cash",
        currency: "UZS",
      },
    });
  const posting = (box, amount, key = randomUUID(), kind = "adjustment") => ({
    p_tenant: tenant,
    p_cashbox: box,
    p_request: key,
    p_kind: kind,
    p_amount: amount,
    p_reason: "Verified local finance test",
  });
  let box, otherBox;
  await t.test(
    "rendered forms create/edit cashboxes and list real calculated balances",
    async () => {
      const created = await post("/finance/cashboxes/new", "Create cashbox", {
        branch_id: branch,
        name: `Test drawer ${suffix}`,
        cashbox_type: "cash",
        is_active: "true",
      });
      assert.equal(created.response.status, 303, created.html.slice(0, 150));
      box = created.response.headers
        .get("location")
        .split("/")[3]
        .split("?")[0];
      assert.equal((await detail(box)).balance, "0.00");
      const edited = await post(
        `/finance/cashboxes/${box}/edit`,
        "Save cashbox",
        {
          name: `Updated drawer ${suffix}`,
          cashbox_type: "bank",
          is_active: "true",
        },
      );
      assert.equal(edited.response.status, 303);
      const list = await get("/finance/cashboxes");
      assert.equal(list.response.status, 200);
      assert.ok(list.html.includes(`Updated drawer ${suffix}`));
      assert.ok(list.html.includes("0.00 UZS"));
      assert.equal((await get("/finance")).response.status, 200);
    },
  );
  await t.test(
    "opening balance and signed corrections use confirmed real server actions and exact decimals",
    async () => {
      const path = `/finance/cashboxes/${box}`;
      const opening = await post(path, "Post opening balance", {
        amount: "100.10",
        reason: "Verified initial cash count",
        confirm_posting: "on",
      });
      assert.equal(opening.response.status, 303);
      const adjustment = await post(path, "Post adjustment", {
        amount: "-0.10",
        reason: "Correct initial count",
        confirm_posting: "on",
      });
      assert.equal(adjustment.response.status, 303);
      assert.equal((await detail(box)).balance, "100.00");
      assert.equal((await detail(box)).total, 2);
      const page = await get(path);
      assert.ok(page.html.includes("100.00 UZS"));
      assert.ok(page.html.includes("Financial audit history"));
      assert.ok(!page.html.includes("Post opening balance"));
      for (const amount of ["0", "0.001", "-100.01"]) {
        const rejected = await post(path, "Post adjustment", {
          amount,
          reason: "Invalid test posting",
          confirm_posting: "on",
        });
        assert.equal(rejected.response.status, 200);
        assert.ok(rejected.html.includes('role="alert"'));
      }
      const noConfirmation = await post(path, "Post adjustment", {
        amount: "1",
        reason: "Missing confirmation",
      });
      assert.equal(noConfirmation.response.status, 200);
      assert.ok(noConfirmation.html.includes("Confirm the immutable"));
      assert.equal((await detail(box)).total, 2);
    },
  );
  await t.test(
    "deactivation retains history and denies new posting; settings can reactivate",
    async () => {
      const edited = await post(
        `/finance/cashboxes/${box}/edit`,
        "Save cashbox",
        {
          name: `Updated drawer ${suffix}`,
          cashbox_type: "bank",
          is_active: "false",
        },
      );
      assert.equal(edited.response.status, 303);
      const page = await get(`/finance/cashboxes/${box}`);
      assert.ok(page.html.includes("100.00 UZS"));
      assert.ok(!page.html.includes("Post adjustment"));
      assert.ok(
        (await owner.client.rpc("post_cashbox_entry", posting(box, "1"))).error,
      );
      const restored = await post(
        `/finance/cashboxes/${box}/edit`,
        "Save cashbox",
        {
          name: `Updated drawer ${suffix}`,
          cashbox_type: "bank",
          is_active: "true",
        },
      );
      assert.equal(restored.response.status, 303);
    },
  );
  await t.test(
    "concurrent duplicate requests post once and concurrent withdrawals cannot overdraw",
    async () => {
      const concurrent = await create(branch),
        key = randomUUID();
      const [a, b] = await Promise.all([
        owner.client.rpc(
          "post_cashbox_entry",
          posting(concurrent, "100.00", key, "opening_balance"),
        ),
        owner.client.rpc(
          "post_cashbox_entry",
          posting(concurrent, "100.00", key, "opening_balance"),
        ),
      ]);
      assert.ifError(a.error);
      assert.ifError(b.error);
      assert.equal(a.data, b.data);
      assert.equal((await detail(concurrent)).total, 1);
      const attempts = await Promise.all([
        owner.client.rpc("post_cashbox_entry", posting(concurrent, "-80")),
        owner.client.rpc("post_cashbox_entry", posting(concurrent, "-80")),
      ]);
      assert.equal(attempts.filter((r) => !r.error).length, 1);
      assert.equal(attempts.filter((r) => r.error).length, 1);
      assert.equal((await detail(concurrent)).balance, "20.00");
      assert.equal((await detail(concurrent)).total, 2);
      const changed = await owner.client.rpc(
        "post_cashbox_entry",
        posting(concurrent, "200", key, "opening_balance"),
      );
      assert.ok(changed.error);
    },
  );
  await t.test(
    "concurrent cashbox creation and first openings remain unique; large sums retain exact strings over REST",
    async () => {
      const request = randomUUID(),
        args = {
          p_tenant: tenant,
          p_id: null,
          p_request: request,
          p_data: {
            name: "Duplicate create test",
            branch_id: branch,
            cashbox_type: "cash",
          },
        };
      const results = await Promise.all([
        owner.client.rpc("save_cashbox", args),
        owner.client.rpc("save_cashbox", args),
      ]);
      for (const r of results) assert.ifError(r.error);
      assert.equal(results[0].data, results[1].data);
      const id = results[0].data;
      const openings = await Promise.all([
        owner.client.rpc(
          "post_cashbox_entry",
          posting(id, "9999999999999999.99", randomUUID(), "opening_balance"),
        ),
        owner.client.rpc(
          "post_cashbox_entry",
          posting(id, "100", randomUUID(), "opening_balance"),
        ),
      ]);
      assert.equal(openings.filter((r) => !r.error).length, 1);
      assert.equal((await detail(id)).total, 1);
      const large = await create(branch);
      await rpc(
        owner,
        "post_cashbox_entry",
        posting(large, "9999999999999999.99", randomUUID(), "opening_balance"),
      );
      await rpc(owner, "post_cashbox_entry", posting(large, "0.01"));
      assert.equal((await detail(large)).balance, "10000000000000000.00");
      assert.ok(
        (await get(`/finance/cashboxes/${large}`)).html.includes(
          "10,000,000,000,000,000.00 UZS",
        ),
      );
    },
  );
  await t.test(
    "cashier has assigned-branch read-only scope and cannot mutate or see business-wide/foreign finances",
    async () => {
      otherBox = await create(second);
      const wide = await create(null);
      const page = await get(`/finance/cashboxes/${box}`, cashier);
      assert.equal(page.response.status, 200);
      assert.ok(page.html.includes("100.00 UZS"));
      assert.ok(!page.html.includes("Post adjustment"));
      assert.ok(!page.html.includes("Financial audit history"));
      for (const id of [otherBox, wide]) {
        const result = await cashier.client.rpc("cashbox_details", {
          p_tenant: tenant,
          p_cashbox: id,
        });
        assert.ok(result.error);
        const forbidden = await get(`/finance/cashboxes/${id}`, cashier);
        // Next's loading boundary may already have streamed HTTP 200 before
        // notFound(). Verify the denial UI/noindex and absence of financial data.
        assert.ok([200, 404].includes(forbidden.response.status));
        assert.ok(forbidden.html.includes("Page not found"));
        assert.match(forbidden.html, /name="robots" content="noindex"/);
        assert.ok(!forbidden.html.includes("Current calculated balance"));
      }
      assert.ok(
        (await cashier.client.rpc("post_cashbox_entry", posting(box, "1")))
          .error,
      );
      assert.ok(
        (
          await cashier.client.rpc("save_cashbox", {
            p_tenant: tenant,
            p_id: null,
            p_request: randomUUID(),
            p_data: {
              branch_id: branch,
              name: "Forged cashier box",
              cashbox_type: "cash",
            },
          })
        ).error,
      );
      const direct = await owner.client
        .from("financial_ledger_entries")
        .select("amount");
      assert.ok(direct.error);
      assert.ok(
        (
          await other.client.rpc("cashbox_details", {
            p_tenant: tenant,
            p_cashbox: box,
          })
        ).error,
      );
      assert.ok(
        (await owner.client.rpc("cashbox_directory", { p_tenant: foreign }))
          .error,
      );
      const forged = await post(
        `/finance/cashboxes/${box}`,
        "Post adjustment",
        {
          tenant_id: foreign,
          amount: "1",
          reason: "Forged tenant test",
          confirm_posting: "on",
        },
      );
      assert.equal(forged.response.status, 200);
      assert.ok(forged.html.includes("Business changed"));
      assert.equal((await detail(box)).balance, "100.00");
    },
  );
  await t.test(
    "ledger filters and actor attribution persist after employee deactivation",
    async () => {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const result = await rpc(owner, "cashbox_details", {
        p_tenant: tenant,
        p_cashbox: box,
        p_filters: {
          from: today,
          to: today,
          kind: "opening_balance",
          actor: owner.id,
        },
      });
      assert.equal(result.total, 1);
      assert.equal(result.balance, "100.00");
      const saved = await rpc(owner, "save_employee", {
        p_tenant: tenant,
        p_id: employee,
        p_full_name: `Cashier ${suffix}`,
        p_phone: "",
        p_email: cashier.email,
        p_job_title: "Cashier",
        p_status: "inactive",
        p_start_date: "2026-10-23",
        p_notes: "Local finance fixture",
        p_branches: [branch],
      });
      assert.equal(saved, employee);
      assert.ok(
        (
          await cashier.client.rpc("cashbox_details", {
            p_tenant: tenant,
            p_cashbox: box,
          })
        ).error,
      );
      const page = await get(`/finance/cashboxes/${box}?kind=opening_balance`);
      assert.equal(page.response.status, 200);
      assert.ok(page.html.includes("Finance QA 0"));
    },
  );
});
