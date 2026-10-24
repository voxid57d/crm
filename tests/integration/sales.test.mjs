import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { localAppOrigin } from "../../src/lib/validation.mjs";

test("real local sales forms, Kanban data, follow-ups, conversion and authorization", async (t) => {
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
  for (let i = 0; i < 3; i++) {
    const cookies = new Map();
    const client = createServerClient(url, key, {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (updates) =>
          updates.forEach(({ name, value }) =>
            value ? cookies.set(name, value) : cookies.delete(name),
          ),
      },
    });
    const email = `sales-live-${suffix}-${i}@example.test`;
    const result = await client.auth.signUp({
      email,
      password: `Sales-live-${randomUUID()}!`,
      options: { data: { full_name: `Sales QA ${i}` } },
    });
    assert.ifError(result.error);
    assert.ok(result.data.session);
    accounts.push({ client, cookies, email, id: result.data.user.id });
  }
  const [owner, other, staff] = accounts;
  const rpc = async (account, name, args) => {
    const r = await account.client.rpc(name, args);
    assert.ifError(r.error);
    return r.data;
  };
  const a = await rpc(owner, "create_business", {
    p_name: `Sales live A ${suffix}`,
  });
  const b = await rpc(other, "create_business", {
    p_name: `Sales live B ${suffix}`,
  });
  const branchResult = await owner.client
    .from("branches")
    .select("id")
    .eq("tenant_id", a)
    .single();
  assert.ifError(branchResult.error);
  const branch = branchResult.data.id;
  const secondResult = await owner.client
    .from("branches")
    .insert({ tenant_id: a, name: "Other branch" })
    .select("id")
    .single();
  assert.ifError(secondResult.error);
  const second = secondResult.data.id;
  const pipelineResult = await owner.client
    .from("sales_pipelines")
    .select("*")
    .eq("tenant_id", a)
    .single();
  assert.ifError(pipelineResult.error);
  const pipeline = pipelineResult.data.id;
  const stageResult = await owner.client
    .from("sales_stages")
    .select("*")
    .eq("tenant_id", a)
    .order("position");
  assert.ifError(stageResult.error);
  const stages = stageResult.data;
  const initial = stages.find((s) => s.outcome === "open").id,
    contacted = stages.find((s) => s.name === "Contacted").id,
    lost = stages.find((s) => s.outcome === "lost").id;
  const reasonResult = await owner.client
    .from("lead_loss_reasons")
    .select("id")
    .eq("tenant_id", a)
    .limit(1);
  assert.ifError(reasonResult.error);
  const reason = reasonResult.data[0].id;
  const roleResult = await owner.client
    .from("business_roles")
    .select("id")
    .eq("tenant_id", a)
    .eq("system_key", "sales_manager")
    .single();
  assert.ifError(roleResult.error);
  const employee = await rpc(owner, "save_employee", {
    p_tenant: a,
    p_id: null,
    p_full_name: `Salesperson ${suffix}`,
    p_phone: "",
    p_email: staff.email,
    p_job_title: "Sales",
    p_status: "active",
    p_start_date: "2026-10-23",
    p_notes: "Live sales fixture",
    p_branches: [branch],
  });
  const token = await rpc(owner, "create_employee_invitation", {
    p_tenant: a,
    p_employee: employee,
    p_role: roleResult.data.id,
  });
  await rpc(staff, "accept_employee_invitation", { p_token: token });
  const cookie = (account) =>
    [...account.cookies, ["forma-tenant", a], ["forma-branch", branch]]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
  const get = async (path, account = owner) => {
    const r = await fetch(origin + path, {
      headers: { Cookie: cookie(account) },
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
    });
    return { response: r, html: await r.text() };
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
    for (const [k, v] of Object.entries(values)) {
      body.delete(k);
      for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
    }
    const r = await fetch(origin + path, {
      method: "POST",
      body,
      headers: { Cookie: cookie(account), Origin: origin },
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
    });
    return { response: r, html: await r.text() };
  };
  let lead, customer, followup;
  await t.test(
    "create/edit real lead through rendered forms; table and board show persisted data",
    async () => {
      const created = await post("/leads/new", "Create lead", {
        branch_id: branch,
        pipeline_id: pipeline,
        stage_id: initial,
        first_name: `Sales lead ${suffix}`,
        phone: "998905551111",
        assigned_employee_id: employee,
        priority: "high",
      });
      assert.equal(created.response.status, 303, created.html.slice(0, 150));
      lead = created.response.headers
        .get("location")
        .split("/")[2]
        .split("?")[0];
      const edited = await post(`/leads/${lead}/edit`, "Save lead", {
        branch_id: branch,
        first_name: `Updated sales ${suffix}`,
        phone: "998905551111",
        assigned_employee_id: employee,
        priority: "urgent",
      });
      assert.equal(edited.response.status, 303);
      const table = await get("/leads");
      assert.ok(table.html.includes(`Updated sales ${suffix}`));
      const board = await get("/sales/board");
      assert.equal(board.response.status, 200);
      assert.ok(board.html.includes(`Updated sales ${suffix}`));
      assert.ok(board.html.includes("Sales Kanban board"));
    },
  );
  await t.test(
    "stage persistence, stale rejection, note and business-timezone follow-up lifecycle",
    async () => {
      const moved = await post(`/leads/${lead}`, "Save stage", {
        stage_id: contacted,
        reason_id: "",
        loss_notes: "",
      });
      assert.equal(moved.response.status, 200);
      assert.ok(moved.html.includes("Lead stage saved"));
      assert.ok(
        (
          await owner.client.rpc("move_lead", {
            p_tenant: a,
            p_lead: lead,
            p_stage: initial,
            p_expected_stage: initial,
          })
        ).error,
      );
      const note = await post(`/leads/${lead}`, "Record communication", {
        note_kind: "call",
        body: `Pricing call ${suffix}`,
      });
      assert.ok(note.html.includes("Interaction recorded"));
      const task = await post(`/leads/${lead}`, "Schedule follow-up", {
        responsible_employee_id: employee,
        kind: "meeting",
        description: `Discuss offer ${suffix}`,
        scheduled_local: "2026-10-24T10:30",
      });
      assert.equal(task.response.status, 200);
      assert.ok(task.html.includes("Follow-up saved"));
      const f = await owner.client
        .from("lead_followups")
        .select("*")
        .eq("lead_id", lead)
        .single();
      assert.ifError(f.error);
      followup = f.data.id;
      assert.equal(
        new Date(f.data.scheduled_at).toISOString(),
        "2026-10-24T05:30:00.000Z",
      );
      const completed = await post(`/leads/${lead}`, "Complete follow-up", {
        followup_id: followup,
        outcome_notes: "Accepted next steps",
      });
      assert.ok(completed.html.includes("Follow-up completed"));
      const page = await get("/sales/follow-ups?state=completed");
      assert.ok(page.html.includes(`Discuss offer ${suffix}`));
    },
  );
  await t.test(
    "real pipeline/source settings, lost reason and reopening retain actual history",
    async () => {
      const source = await post("/sales/settings/sources", "Create option", {
        setting_kind: "source",
        name: `Local source ${suffix}`,
        is_active: "true",
      });
      assert.ok(source.html.includes("Sales configuration saved"));
      const settings = await get("/sales/settings/pipelines");
      assert.equal(settings.response.status, 200);
      assert.ok(settings.html.includes("Reorder stages"));
      const configured = await post(
        "/sales/settings/pipelines",
        "Create pipeline",
        {
          setting_kind: "pipeline",
          name: `Corporate ${suffix}`,
          is_active: "true",
        },
      );
      assert.ok(configured.html.includes("Sales configuration saved"));
      const custom = await owner.client
        .from("sales_pipelines")
        .select("id")
        .eq("tenant_id", a)
        .eq("name", `Corporate ${suffix}`)
        .single();
      assert.ifError(custom.error);
      const customStages = await owner.client
        .from("sales_stages")
        .select("*")
        .eq("pipeline_id", custom.data.id)
        .order("position");
      assert.ifError(customStages.error);
      assert.equal(customStages.data.length, 4);
      const order = customStages.data.map((s) => s.id).reverse();
      const reordered = await post(
        "/sales/settings/pipelines",
        "Save stage order",
        { pipeline_id: custom.data.id, stage_order: order.join(",") },
      );
      assert.ok(reordered.html.includes("Stage order saved"));
      const persistedOrder = await owner.client
        .from("sales_stages")
        .select("id")
        .eq("pipeline_id", custom.data.id)
        .order("position");
      assert.deepEqual(
        persistedOrder.data.map((s) => s.id),
        order,
      );
      const loss = await post(`/leads/${lead}`, "Save stage", {
        stage_id: lost,
        reason_id: reason,
        loss_notes: "Customer deferred",
      });
      assert.ok(loss.html.includes("Lead stage saved"));
      const reopen = await post(`/leads/${lead}`, "Save stage", {
        stage_id: initial,
        reason_id: "",
        loss_notes: "",
      });
      assert.ok(reopen.html.includes("Lead stage saved"));
      const history = await owner.client
        .from("lead_activities")
        .select("kind")
        .eq("lead_id", lead);
      assert.ifError(history.error);
      assert.ok(history.data.some((a) => a.kind === "lost"));
      assert.ok(history.data.some((a) => a.kind === "reopened"));
    },
  );
  await t.test(
    "transactional conversion form creates once and can link existing matched contact",
    async () => {
      const converted = await post(`/leads/${lead}`, "Convert lead", {
        confirm: "on",
        customer_id: "",
      });
      assert.equal(converted.response.status, 303);
      assert.match(converted.response.headers.get("location"), /^\/students\//);
      const l = await owner.client
        .from("leads")
        .select("*")
        .eq("id", lead)
        .single();
      assert.ifError(l.error);
      customer = l.data.customer_id;
      assert.ok(customer);
      assert.equal(
        await rpc(owner, "convert_lead", { p_tenant: a, p_lead: lead }),
        customer,
      );
      const duplicate = await rpc(owner, "save_lead", {
        p_tenant: a,
        p_id: null,
        p_data: {
          branch_id: branch,
          pipeline_id: pipeline,
          stage_id: initial,
          first_name: "Second enquiry",
          phone: "998905551111",
        },
      });
      const linked = await post(`/leads/${duplicate}`, "Convert lead", {
        confirm: "on",
        customer_id: customer,
      });
      assert.equal(linked.response.status, 303);
      assert.ok(
        linked.response.headers
          .get("location")
          .includes(`/students/${customer}`),
      );
      const count = await owner.client
        .from("customers")
        .select("id", { count: "exact" })
        .eq("tenant_id", a);
      assert.equal(count.count, 1);
      const metrics = await rpc(owner, "sales_analytics", { p_tenant: a });
      assert.equal(metrics.converted, 2);
      assert.equal(metrics.total, 2);
      assert.equal(metrics.conversion_rate, 100);
      const report = await get("/sales/reports");
      assert.equal(report.response.status, 200);
      assert.ok(report.html.includes("100%"));
    },
  );
  await t.test(
    "concurrent conversion requests create only one customer",
    async () => {
      const racing = await rpc(owner, "save_lead", {
        p_tenant: a,
        p_id: null,
        p_data: {
          branch_id: branch,
          pipeline_id: pipeline,
          stage_id: initial,
          first_name: "Concurrent conversion",
          phone: "998905552222",
        },
      });
      const results = await Promise.all([
        owner.client.rpc("convert_lead", { p_tenant: a, p_lead: racing }),
        owner.client.rpc("convert_lead", { p_tenant: a, p_lead: racing }),
      ]);
      for (const result of results) assert.ifError(result.error);
      assert.equal(results[0].data, results[1].data);
      const created = await owner.client
        .from("customers")
        .select("id", { count: "exact" })
        .eq("id", results[0].data);
      assert.ifError(created.error);
      assert.equal(created.count, 1);
    },
  );
  await t.test(
    "view-only and foreign-tenant identities cannot bypass stage/configuration/conversion rules",
    async () => {
      const foreign = await rpc(owner, "save_lead", {
        p_tenant: a,
        p_id: null,
        p_data: {
          branch_id: second,
          pipeline_id: pipeline,
          stage_id: initial,
          first_name: `Private branch ${suffix}`,
          phone: "555222",
        },
      });
      const role = await rpc(owner, "save_business_role", {
        p_tenant: a,
        p_id: null,
        p_name: "Sales viewer only",
        p_scope: "branch",
        p_permissions: ["branches.view", "leads.view"],
      });
      await rpc(owner, "assign_member_role", {
        p_tenant: a,
        p_user: staff.id,
        p_role: role,
        p_branches: [branch],
      });
      const hidden = await staff.client
        .from("leads")
        .select("*")
        .eq("id", foreign);
      assert.ifError(hidden.error);
      assert.equal(hidden.data.length, 0);
      assert.ok(
        (
          await staff.client.rpc("move_lead", {
            p_tenant: a,
            p_lead: lead,
            p_stage: lost,
            p_expected_stage: initial,
            p_reason: reason,
          })
        ).error,
      );
      assert.ok(
        (
          await staff.client.rpc("save_sales_setting", {
            p_tenant: a,
            p_id: null,
            p_kind: "pipeline",
            p_data: { name: "Unauthorized" },
          })
        ).error,
      );
      const raw = await other.client
        .from("leads")
        .select("*")
        .eq("tenant_id", a);
      assert.ifError(raw.error);
      assert.equal(raw.data.length, 0);
      assert.ok(
        (await other.client.rpc("convert_lead", { p_tenant: a, p_lead: lead }))
          .error,
      );
      const forged = await post(`/leads/${lead}`, "Archive lead", {
        tenant_id: b,
        archive: "true",
      });
      assert.equal(forged.response.status, 200);
      assert.ok(forged.html.includes("Business changed. Reload before saving"));
    },
  );
});
