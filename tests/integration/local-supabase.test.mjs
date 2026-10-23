import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { localAppOrigin } from "../../src/lib/validation.mjs";

// Explicit opt-in suite. Creates disposable real Auth accounts and business
// records in local Supabase; never deletes data or uses a service-role key.
test("real local Supabase Auth, PostgREST, and authenticated Next.js rendering", async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.ok(
    url && key,
    "Start Docker/Supabase and configure the local URL/public key in .env.local first.",
  );
  const api = new URL(url);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname),
    "Integration tests require loopback Supabase.",
  );
  assert.ok(!key.startsWith("sb_secret_"), "Only a public key may be used.");
  if (key.split(".").length === 3)
    assert.equal(
      JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role,
      "anon",
    );
  const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const suffix = randomUUID().slice(0, 8);
  const secret = `Local-integration-${randomUUID()}!`;
  const accounts = [];
  const cookieHeader = (account, extra = {}) =>
    [...account.cookies, ...Object.entries(extra)]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
  const getPage = (path, account, extra) =>
    fetch(`${origin}${path}`, {
      redirect: "manual",
      headers: account ? { Cookie: cookieHeader(account, extra) } : {},
      signal: AbortSignal.timeout(10000),
    });
  let businessA, businessB, branchA, branchA2;
  await t.test(
    "registration issues real sessions and creates self-only profiles",
    async () => {
      for (let index = 0; index < 4; index++) {
        const cookies = new Map();
        const client = createServerClient(url, key, {
          cookies: {
            getAll: () =>
              Array.from(cookies, ([name, value]) => ({ name, value })),
            setAll: (updates) =>
              updates.forEach(({ name, value }) => {
                if (value) cookies.set(name, value);
                else cookies.delete(name);
              }),
          },
        });
        const email = `forma-qa-${suffix}-${index}@example.test`;
        const { data, error } = await client.auth.signUp({
          email,
          password: secret,
          options: { data: { full_name: `Local QA ${index}`, role: "owner" } },
        });
        assert.ifError(error);
        assert.ok(
          data.session,
          "Default local email confirmations must be disabled for this automated suite.",
        );
        const account = { client, cookies, email, id: data.user.id };
        accounts.push(account);
        const profile = await client.from("profiles").select("*");
        assert.ifError(profile.error);
        assert.deepEqual(
          profile.data.map((row) => row.id),
          [account.id],
        );
      }
    },
  );
  await t.test(
    "two users create independent businesses through authenticated RPC",
    async () => {
      const a = await accounts[0].client.rpc("create_business", {
        p_name: `Local QA A ${suffix}`,
      });
      assert.ifError(a.error);
      businessA = a.data;
      const b = await accounts[1].client.rpc("create_business", {
        p_name: `Local QA B ${suffix}`,
      });
      assert.ifError(b.error);
      businessB = b.data;
      const initial = await accounts[0].client
        .from("branches")
        .select("*")
        .eq("tenant_id", businessA);
      assert.ifError(initial.error);
      branchA = initial.data[0].id;
      const second = await accounts[0].client
        .from("branches")
        .insert({ tenant_id: businessA, name: "Second branch" })
        .select()
        .single();
      assert.ifError(second.error);
      branchA2 = second.data.id;
      const tenant = await accounts[0].client
        .from("tenants")
        .select("*")
        .eq("id", businessA)
        .single();
      assert.ifError(tenant.error);
      assert.equal(tenant.data.owner_id, accounts[0].id);
      assert.equal(tenant.data.currency, "UZS");
      assert.equal(tenant.data.timezone, "Asia/Tashkent");
    },
  );
  await t.test(
    "foreign IDs cannot expose or alter another business",
    async () => {
      for (const [account, foreign] of [
        [accounts[0], businessB],
        [accounts[1], businessA],
      ]) {
        const read = await account.client
          .from("tenants")
          .select("*")
          .eq("id", foreign);
        assert.ifError(read.error);
        assert.equal(read.data.length, 0);
        const update = await account.client
          .from("tenants")
          .update({ name: "Unauthorized" })
          .eq("id", foreign)
          .select();
        assert.ifError(update.error);
        assert.equal(update.data.length, 0);
        const insert = await account.client
          .from("branches")
          .insert({ tenant_id: foreign, name: "Unauthorized" });
        assert.ok(insert.error);
      }
    },
  );
  await t.test(
    "Owner assigns branch roles; Manager and Employee cannot escalate",
    async () => {
      for (const [index, role] of [
        [2, "manager"],
        [3, "employee"],
      ]) {
        const assigned = await accounts[0].client.rpc("set_business_member", {
          p_tenant: businessA,
          p_email: accounts[index].email,
          p_role: role,
          p_branches: [branchA],
        });
        assert.ifError(assigned.error);
        const visible = await accounts[index].client
          .from("branches")
          .select("id");
        assert.ifError(visible.error);
        assert.deepEqual(
          visible.data.map((row) => row.id),
          [branchA],
        );
        const promotion = await accounts[index].client.rpc(
          "set_business_member",
          {
            p_tenant: businessA,
            p_email: accounts[index].email,
            p_role: "admin",
            p_branches: [],
          },
        );
        assert.ok(promotion.error);
        const unassigned = await accounts[index].client
          .from("branches")
          .update({ name: "Unauthorized" })
          .eq("id", branchA2)
          .select();
        assert.ifError(unassigned.error);
        assert.equal(unassigned.data.length, 0);
      }
      const allowed = await accounts[2].client
        .from("branches")
        .update({ address: "Assigned scope" })
        .eq("id", branchA)
        .select();
      assert.ifError(allowed.error);
      assert.equal(allowed.data.length, 1);
      const denied = await accounts[3].client
        .from("branches")
        .update({ address: "Unauthorized" })
        .eq("id", branchA)
        .select();
      assert.ifError(denied.error);
      assert.equal(denied.data.length, 0);
    },
  );
  await t.test(
    "authenticated dashboard uses real session cookies and validated selection",
    async () => {
      const page = await getPage("/dashboard", accounts[0], {
        "forma-tenant": businessA,
        "forma-branch": branchA,
      });
      assert.equal(page.status, 200);
      assert.ok((await page.text()).includes(`Local QA A ${suffix}`));
      const foreign = await getPage("/dashboard", accounts[0], {
        "forma-tenant": businessB,
      });
      assert.equal(foreign.status, 307);
      assert.equal(foreign.headers.get("location"), "/businesses");
      const foreignBranch = await getPage("/dashboard", accounts[2], {
        "forma-tenant": businessA,
        "forma-branch": branchA2,
      });
      assert.equal(foreignBranch.status, 307);
      assert.ok(
        foreignBranch.headers.get("location").startsWith("/businesses"),
      );
      const anonymous = await getPage("/dashboard");
      assert.equal(anonymous.status, 307);
      assert.equal(anonymous.headers.get("location"), "/login");
    },
  );
  await t.test(
    "real employee records, confidential salary rendering and existing-account invitation acceptance",
    async () => {
      const created = await accounts[0].client.rpc("save_employee", {
        p_tenant: businessA,
        p_id: null,
        p_full_name: `QA Employee ${suffix}`,
        p_phone: "+998901234567",
        p_email: accounts[3].email,
        p_job_title: "Assistant",
        p_status: "active",
        p_start_date: "2026-10-22",
        p_notes: "Live local verification",
        p_branches: [branchA],
      });
      assert.ifError(created.error);
      const employeeId = created.data;
      const pay = await accounts[0].client.rpc("save_employee_salary", {
        p_tenant: businessA,
        p_employee: employeeId,
        p_type: "fixed_monthly",
        p_amount: "9007199254740993.12",
        p_percentage: "",
        p_bonus_amount: "",
        p_bonus_percentage: "",
        p_bonus_basis: "",
        p_currency: "UZS",
        p_reason: "Live verification",
      });
      assert.ifError(pay.error);
      const owner = await getPage(`/employees/${employeeId}`, accounts[0], {
        "forma-tenant": businessA,
        "forma-branch": branchA,
      });
      assert.equal(owner.status, 200);
      assert.ok((await owner.text()).includes("9007199254740993.12"));
      const manager = await getPage(`/employees/${employeeId}`, accounts[2], {
        "forma-tenant": businessA,
        "forma-branch": branchA,
      });
      assert.equal(manager.status, 200);
      const html = await manager.text();
      assert.ok(html.includes("Salary information is restricted"));
      assert.ok(!html.includes("9007199254740993.12"));
      assert.ok(
        (
          await accounts[2].client.rpc("get_employee_salary", {
            p_tenant: businessA,
            p_employee: employeeId,
          })
        ).error,
      );
      assert.ok(
        (await accounts[2].client.from("employee_salary_settings").select("*"))
          .error,
      );
      const role = await accounts[0].client
        .from("business_roles")
        .select("id")
        .eq("tenant_id", businessA)
        .eq("system_key", "employee")
        .single();
      assert.ifError(role.error);
      const invitation = await accounts[0].client.rpc(
        "create_employee_invitation",
        { p_tenant: businessA, p_employee: employeeId, p_role: role.data.id },
      );
      assert.ifError(invitation.error);
      assert.ok(
        (
          await accounts[2].client.rpc("accept_employee_invitation", {
            p_token: invitation.data,
          })
        ).error,
      );
      const accepted = await accounts[3].client.rpc(
        "accept_employee_invitation",
        { p_token: invitation.data },
      );
      assert.ifError(accepted.error);
      const linked = await accounts[0].client
        .from("employees")
        .select("user_id")
        .eq("id", employeeId)
        .single();
      assert.equal(linked.data.user_id, accounts[3].id);
      assert.ok(
        (
          await accounts[3].client.rpc("accept_employee_invitation", {
            p_token: invitation.data,
          })
        ).error,
      );
      const deactivated = await accounts[0].client.rpc("save_employee", {
        p_tenant: businessA,
        p_id: employeeId,
        p_full_name: `QA Employee ${suffix}`,
        p_phone: "",
        p_email: accounts[3].email,
        p_job_title: "Assistant",
        p_status: "inactive",
        p_start_date: "2026-10-22",
        p_notes: "Access revoked",
        p_branches: [branchA],
      });
      assert.ifError(deactivated.error);
      const hidden = await accounts[3].client
        .from("tenants")
        .select("*")
        .eq("id", businessA);
      assert.ifError(hidden.error);
      assert.equal(hidden.data.length, 0);
    },
  );
  await t.test(
    "password reset request reaches local Auth; password update and logout use real sessions",
    async () => {
      const requested = await accounts[0].client.auth.resetPasswordForEmail(
        accounts[0].email,
        { redirectTo: `${origin}/auth/callback?next=/reset-password` },
      );
      assert.ifError(requested.error);
      // Email-link redemption remains a manual browser test. This verifies the
      // authenticated password change, login, and logout APIs separately.
      const changed = await accounts[0].client.auth.updateUser({
        password: `${secret}-updated`,
      });
      assert.ifError(changed.error);
      const signedOut = await accounts[0].client.auth.signOut({
        scope: "local",
      });
      assert.ifError(signedOut.error);
      const page = await getPage("/dashboard", accounts[0], {
        "forma-tenant": businessA,
      });
      assert.equal(page.status, 307);
      assert.equal(page.headers.get("location"), "/login");
      const oldLogin = await accounts[0].client.auth.signInWithPassword({
        email: accounts[0].email,
        password: secret,
      });
      assert.ok(oldLogin.error);
      const login = await accounts[0].client.auth.signInWithPassword({
        email: accounts[0].email,
        password: `${secret}-updated`,
      });
      assert.ifError(login.error);
    },
  );
  await t.test(
    "anonymous public-key requests cannot read protected tables",
    async () => {
      const anon = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      assert.ok((await anon.from("tenants").select("*")).error);
      assert.ok(
        (await anon.rpc("create_business", { p_name: "Unauthorized" })).error,
      );
    },
  );
});
