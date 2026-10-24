import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
test("local financial dashboard, ten reports and authorized CSV snapshots", async (t) => {
  const owner = await localAccount("reports-owner"),
    outsider = await localAccount("reports-outsider");
  const tenant = await rpc(owner, "create_business", {
      p_name: "Reports live " + randomUUID().slice(0, 8),
    }),
    foreign = await rpc(outsider, "create_business", {
      p_name: "Foreign reports business",
    });
  const branch = (
      await owner.client
        .from("branches")
        .select("id")
        .eq("tenant_id", tenant)
        .single()
    ).data.id,
    foreignBranch = (
      await outsider.client
        .from("branches")
        .select("id")
        .eq("tenant_id", foreign)
        .single()
    ).data.id;
  const customer = await rpc(owner, "save_customer", {
    p_tenant: tenant,
    p_id: null,
    p_profile: {
      first_name: "=SUM(1,1)",
      last_name: "Report payer",
      phone: "998908881",
    },
    p_branches: [branch],
  });
  const cashbox = await rpc(owner, "save_cashbox", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_data: { branch_id: branch, name: "Report cashbox", cashbox_type: "cash" },
  });
  const date = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    at = date + "T12:00:00+05:00";
  const invoice = await rpc(owner, "save_invoice_draft", {
    p_tenant: tenant,
    p_invoice: null,
    p_request: randomUUID(),
    p_version: 0,
    p_data: {
      branch_id: branch,
      customer_id: customer,
      issue_date: date,
      due_date: date,
      discount_amount: "0",
    },
    p_items: [
      {
        description: "Tuition reporting",
        quantity: "1",
        unit_price: "100",
        discount_amount: "0",
      },
    ],
  });
  await rpc(owner, "transition_invoice", {
    p_tenant: tenant,
    p_invoice: invoice,
    p_request: randomUUID(),
    p_version: 1,
    p_action: "issue",
  });
  const payment = await rpc(owner, "post_payment", {
    p_tenant: tenant,
    p_request: randomUUID(),
    p_data: {
      branch_id: branch,
      customer_id: customer,
      cashbox_id: cashbox,
      amount: "60.10",
      method: "cash",
      paid_at: at,
    },
    p_allocations: [{ invoice_id: invoice, amount: "40" }],
  });
  const category = (
    await rpc(owner, "expense_category_directory", { p_tenant: tenant })
  )[0].id;
  await rpc(owner, "post_expense", {
    p_tenant: tenant,
    p_request: randomUUID(),
    p_data: {
      branch_id: branch,
      cashbox_id: cashbox,
      category_id: category,
      amount: "10",
      occurred_at: at,
      description: "Actual report expense",
    },
  });
  await rpc(owner, "post_payment_refund", {
    p_tenant: tenant,
    p_payment: payment,
    p_request: randomUUID(),
    p_cashbox: cashbox,
    p_amount: "5",
    p_at: at,
    p_reason: "Report customer refund",
  });
  const app = renderedApp(owner, tenant, branch),
    foreignApp = renderedApp(outsider, foreign, foreignBranch);
  await t.test(
    "dashboard renders real totals, trends and branch comparison",
    async () => {
      const d = await rpc(owner, "financial_dashboard", { p_tenant: tenant });
      assert.equal(d.metrics.received, "60.10");
      assert.equal(d.metrics.refunds, "5.00");
      assert.equal(d.metrics.expenses, "10.00");
      assert.equal(d.metrics.cashbox_balance, "45.10");
      assert.equal(d.metrics.outstanding, "60.00");
      const r = await app.get("/finance?preset=custom&branch=");
      assert.equal(r.response.status, 200);
      for (const label of [
        "Gross payments received",
        "Daily collections and expense trends",
        "Branch comparison",
        "Recent cash movements",
      ])
        assert.ok(r.html.includes(label), label);
      assert.ok(!r.html.includes("Dashboard could not load"));
      const profile = await app.get(`/customers/${customer}/finance`);
      assert.equal(profile.response.status, 200);
      assert.ok(profile.html.includes("Customer financial statement"));
    },
  );
  await t.test(
    "all ten report pages render actual authorized rows and filter controls",
    async () => {
      for (const kind of [
        "payments",
        "debts",
        "overdue",
        "expenses",
        "cashbox_transactions",
        "cashbox_balances",
        "branches",
        "refunds",
        "customer_statement",
        "audit",
      ]) {
        const query = new URLSearchParams({
          report: kind,
          ...(kind === "customer_statement" ? { customer } : {}),
        });
        const d = await rpc(owner, "financial_report", {
          p_tenant: tenant,
          p_report: kind,
          p_filters: kind === "customer_statement" ? { customer } : {},
        });
        assert.ok(d.total > 0, kind);
        const r = await app.get("/finance/reports?" + query);
        assert.equal(r.response.status, 200);
        assert.ok(r.html.includes("Export CSV"), kind);
        assert.ok(!r.html.includes("Report could not load"), kind);
      }
    },
  );
  await t.test(
    "CSV uses the same checked filters and protects formula text without rounding money",
    async () => {
      const r = await app.get(
        "/finance/reports/export?report=payments&method=cash&customer=" +
          customer,
      );
      assert.equal(r.response.status, 200, r.html);
      assert.match(r.response.headers.get("content-type"), /text\/csv/);
      assert.match(r.response.headers.get("cache-control"), /no-store/);
      assert.match(r.response.headers.get("content-disposition"), /attachment/);
      assert.ok(r.html.includes('"60.10"'));
      assert.ok(r.html.includes("\'=SUM(1,1) Report payer"));
      const filtered = await app.get(
        "/finance/reports/export?report=payments&method=bank_transfer",
      );
      assert.equal(filtered.response.status, 200);
      assert.ok(!filtered.html.includes("60.10"));
    },
  );
  await t.test(
    "foreign RPCs and forged workspace/filter IDs cannot export protected records",
    async () => {
      for (const name of [
        "financial_dashboard",
        "financial_report",
        "financial_report_export",
      ]) {
        const r = await outsider.client.rpc(name, {
          p_tenant: tenant,
          ...(name === "financial_dashboard" ? {} : { p_report: "payments" }),
        });
        assert.ok(r.error, name);
      }
      const r = await foreignApp.get(
        "/finance/reports/export?report=payments&tenant=" +
          tenant +
          "&customer=" +
          customer,
      );
      assert.equal(r.response.status, 200);
      assert.ok(!r.html.includes("60.10"));
      const denied = await foreignApp.get(
        "/finance/reports/export?report=payments&branch=" + branch,
      );
      assert.equal(denied.response.status, 403);
    },
  );
  await t.test(
    "invalid date ranges and unauthorized customer statements fail safely",
    async () => {
      const bad = await app.get(
        "/finance/reports/export?report=payments&from=2026-10-24&to=2026-10-22",
      );
      assert.equal(bad.response.status, 400);
      const denied = await foreignApp.get(
        "/finance/reports/export?report=customer_statement&customer=" +
          customer,
      );
      assert.equal(denied.response.status, 403);
    },
  );
});
