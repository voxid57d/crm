import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";

test("real local invoice forms, receivables, print and concurrent lifecycle", async (t) => {
  const owner = await localAccount("invoice-owner"),
    other = await localAccount("invoice-other"),
    staff = await localAccount("invoice-staff");
  const tenant = await rpc(owner, "create_business", {
    p_name: "Live invoice business " + randomUUID().slice(0, 8),
  });
  const foreign = await rpc(other, "create_business", {
    p_name: "Foreign invoice business " + randomUUID().slice(0, 8),
  });
  const branches = await owner.client
    .from("branches")
    .select("id")
    .eq("tenant_id", tenant)
    .single();
  assert.ifError(branches.error);
  const branch = branches.data.id;
  const secondResult = await owner.client
    .from("branches")
    .insert({ tenant_id: tenant, name: "Other invoice branch" })
    .select("id")
    .single();
  assert.ifError(secondResult.error);
  const second = secondResult.data.id;
  const customer = await rpc(owner, "save_customer", {
    p_tenant: tenant,
    p_id: null,
    p_profile: { first_name: "Invoice student", phone: "998901234" },
    p_branches: [branch],
  });
  const shared = await rpc(owner, "save_customer", {
    p_tenant: tenant,
    p_id: null,
    p_profile: { first_name: "Shared invoice contact", phone: "998902345" },
    p_branches: [branch, second],
  });
  const role = await owner.client
    .from("business_roles")
    .select("id")
    .eq("tenant_id", tenant)
    .eq("system_key", "cashier")
    .single();
  assert.ifError(role.error);
  const employee = await rpc(owner, "save_employee", {
    p_tenant: tenant,
    p_id: null,
    p_full_name: "Billing staff",
    p_phone: "",
    p_email: staff.email,
    p_job_title: "Cashier",
    p_status: "active",
    p_start_date: "2026-10-23",
    p_notes: "Local invoice fixture",
    p_branches: [branch],
  });
  const token = await rpc(owner, "create_employee_invitation", {
    p_tenant: tenant,
    p_employee: employee,
    p_role: role.data.id,
  });
  await rpc(staff, "accept_employee_invitation", { p_token: token });
  const box = await rpc(owner, "save_cashbox", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_data: {
      name: "Cash unaffected by invoices",
      branch_id: branch,
      cashbox_type: "cash",
    },
  });
  await rpc(owner, "post_cashbox_entry", {
    p_tenant: tenant,
    p_cashbox: box,
    p_request: randomUUID(),
    p_kind: "opening_balance",
    p_amount: "10",
    p_reason: "Baseline cash before invoices",
  });
  const app = renderedApp(owner, tenant, branch),
    staffApp = renderedApp(staff, tenant, branch),
    detail = (id) =>
      rpc(owner, "invoice_details", { p_tenant: tenant, p_invoice: id });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const earlier = new Date(`${today}T00:00:00Z`);
  earlier.setUTCDate(earlier.getUTCDate() - 8);
  const past = earlier.toISOString().slice(0, 10);
  const values = {
    branch_id: branch,
    customer_id: customer,
    issue_date: past,
    due_date: past,
    invoice_discount: "10.00",
    notes: "Live invoice draft",
    line_description: ["Tuition"],
    line_quantity: ["1.5"],
    line_price: ["100.10"],
    line_discount: ["0.15"],
  };
  const data = {
    branch_id: branch,
    customer_id: customer,
    currency: "UZS",
    issue_date: today,
    due_date: today,
    discount_amount: "0",
  };
  const lines = [
    {
      description: "Concurrent invoice",
      quantity: "1",
      unit_price: "10",
      discount_amount: "0",
    },
  ];
  const create = (extra) =>
    rpc(owner, "save_invoice_draft", {
      p_tenant: tenant,
      p_invoice: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: { ...data, ...extra },
      p_items: lines,
    });
  const issue = (id, key = randomUUID(), version = 1) => ({
    p_tenant: tenant,
    p_invoice: id,
    p_request: key,
    p_version: version,
    p_action: "issue",
    p_reason: "",
  });
  let invoice, replacement, sharedFirst, sharedSecond;
  await t.test(
    "rendered draft create/edit/retry persist exact lines without posting debt",
    async () => {
      const key = randomUUID();
      const created = await app.post(
        "/finance/invoices/new",
        "Save invoice draft",
        { ...values, request_id: key },
      );
      assert.equal(created.response.status, 303, created.html.slice(0, 180));
      invoice = created.response.headers
        .get("location")
        .split("/")[3]
        .split("?")[0];
      const retry = await app.post(
        "/finance/invoices/new",
        "Save invoice draft",
        { ...values, request_id: key },
      );
      assert.equal(retry.response.status, 303);
      assert.ok(retry.response.headers.get("location").includes(invoice));
      const edited = await app.post(
        `/finance/invoices/${invoice}/edit`,
        "Save invoice draft",
        { ...values, notes: "Reviewed draft" },
      );
      assert.equal(edited.response.status, 303);
      const d = await detail(invoice);
      assert.equal(d.total, "140.00");
      assert.equal(d.outstanding, "0.00");
      assert.equal(d.invoice.version, 2);
      assert.equal(d.invoice.items[0].unit_price, "100.10");
      assert.ok(
        (await app.get("/finance/invoices")).html.includes("Invoice student"),
      );
      const invalid = await app.post(
        `/finance/invoices/${invoice}/edit`,
        "Save invoice draft",
        { ...values, line_price: ["0.001"] },
      );
      assert.equal(invalid.response.status, 200);
      assert.ok(invalid.html.includes("Draft rejected"));
      assert.equal((await detail(invoice)).invoice.version, 2);
    },
  );
  await t.test(
    "confirmed issue creates overdue debt and real customer financial/profile/print pages",
    async () => {
      const path = `/finance/invoices/${invoice}`;
      const rejected = await app.post(path, "Issue invoice", {});
      assert.equal(rejected.response.status, 200);
      assert.ok(rejected.html.includes("Confirm the invoice action"));
      const issued = await app.post(path, "Issue invoice", {
        confirm_invoice: "on",
      });
      assert.equal(issued.response.status, 303);
      const d = await detail(invoice);
      assert.equal(d.invoice.invoice_number, "INV-000001");
      assert.equal(d.status, "overdue");
      assert.equal(d.outstanding, "140.00");
      for (const path of [
        "/finance/debts",
        `/customers/${customer}/finance`,
        `/customers/${customer}`,
      ]) {
        const page = await app.get(path);
        assert.equal(page.response.status, 200);
        assert.ok(page.html.includes("140.00 UZS"), path);
      }
      const print = await app.get(`${path}/print`);
      assert.equal(print.response.status, 200);
      assert.ok(print.html.includes("INV-000001"));
      assert.ok(print.html.includes("Invoice student"));
      assert.ok(!print.html.includes("Main navigation"));
      const choices = await app.get(
        `/finance/invoices/new?customer=${customer}&branch=${branch}`,
      );
      assert.equal(choices.response.status, 200);
      assert.ok(choices.html.includes("Invoice student"));
    },
  );
  await t.test(
    "void form offsets debt, preserves customer snapshots and links an editable replacement draft",
    async () => {
      await rpc(owner, "save_customer", {
        p_tenant: tenant,
        p_id: customer,
        p_profile: {
          first_name: "Renamed invoice contact",
          phone: "998901234",
        },
        p_branches: [branch],
      });
      assert.equal(
        (await detail(invoice)).invoice.bill_to.name,
        "Invoice student",
      );
      const voided = await app.post(
        `/finance/invoices/${invoice}`,
        "Void invoice",
        { confirm_invoice: "on", reason: "Incorrect billed service" },
      );
      assert.equal(voided.response.status, 303);
      const d = await detail(invoice);
      assert.equal(d.outstanding, "0.00");
      assert.equal(d.total, "140.00");
      assert.equal(d.invoice.state, "voided");
      assert.equal(d.receivables.length, 2);
      const newPath = `/finance/invoices/new?replacement=${invoice}`;
      const r = await app.post(newPath, "Save invoice draft", {
        ...values,
        issue_date: today,
        due_date: today,
        replaces_invoice_id: invoice,
      });
      assert.equal(r.response.status, 303);
      replacement = r.response.headers
        .get("location")
        .split("/")[3]
        .split("?")[0];
      assert.equal(
        (await detail(replacement)).invoice.replaces_invoice_id,
        invoice,
      );
      const discarded = await app.post(
        `/finance/invoices/${replacement}`,
        "Discard draft",
        { confirm_invoice: "on", reason: "Replacement no longer required" },
      );
      assert.equal(discarded.response.status, 303);
      assert.equal((await detail(replacement)).invoice.state, "discarded");
      assert.equal((await detail(replacement)).outstanding, "0.00");
    },
  );
  await t.test(
    "concurrent duplicate issue, atomic numbering and stale edit/issue cannot create inconsistent receivables",
    async () => {
      const a = await create({}),
        key = randomUUID();
      const repeats = await Promise.all([
        owner.client.rpc("transition_invoice", issue(a, key)),
        owner.client.rpc("transition_invoice", issue(a, key)),
      ]);
      for (const r of repeats) assert.ifError(r.error);
      assert.equal(repeats[0].data, repeats[1].data);
      assert.equal((await detail(a)).receivables.length, 1);
      assert.equal((await detail(a)).audit_total, 2);
      const b = await create({}),
        c = await create({});
      const numbered = await Promise.all([
        owner.client.rpc("transition_invoice", issue(b)),
        owner.client.rpc("transition_invoice", issue(c)),
      ]);
      for (const r of numbered) assert.ifError(r.error);
      assert.notEqual(
        (await detail(b)).invoice.invoice_number,
        (await detail(c)).invoice.invoice_number,
      );
      const racing = await create({});
      const attempts = await Promise.all([
        owner.client.rpc("transition_invoice", issue(racing)),
        owner.client.rpc("save_invoice_draft", {
          p_tenant: tenant,
          p_invoice: racing,
          p_request: randomUUID(),
          p_version: 1,
          p_data: data,
          p_items: [{ ...lines[0], unit_price: "20" }],
        }),
      ]);
      assert.equal(attempts.filter((r) => !r.error).length, 1);
      assert.equal(attempts.filter((r) => r.error).length, 1);
      const d = await detail(racing);
      assert.equal(d.invoice.version, 2);
      if (d.invoice.state === "issued") {
        assert.equal(d.outstanding, "10.00");
        assert.equal(d.total, "10.00");
      } else {
        assert.equal(d.invoice.state, "draft");
        assert.equal(d.total, "20.00");
        assert.equal(d.outstanding, "0.00");
      }
    },
  );
  await t.test(
    "shared-customer debt has exact branch scope and cashier cannot issue, void, edit or disclose another branch",
    async () => {
      sharedFirst = await create({ customer_id: shared });
      sharedSecond = await create({ customer_id: shared, branch_id: second });
      await rpc(owner, "transition_invoice", issue(sharedFirst));
      await rpc(owner, "transition_invoice", issue(sharedSecond));
      const profile = await rpc(owner, "customer_financial_profile", {
        p_tenant: tenant,
        p_customer: shared,
      });
      assert.equal(profile.summary.outstanding, "20.00");
      const scoped = await rpc(owner, "customer_financial_profile", {
        p_tenant: tenant,
        p_customer: shared,
        p_branch: branch,
      });
      assert.equal(scoped.summary.outstanding, "10.00");
      const permitted = await staffApp.get(`/finance/invoices/${sharedFirst}`);
      assert.equal(permitted.response.status, 200);
      assert.ok(permitted.html.includes("Shared invoice contact"));
      assert.ok(!permitted.html.includes("Void invoice"));
      assert.ok(!permitted.html.includes("Before change"));
      const denied = await staffApp.get(`/finance/invoices/${sharedSecond}`);
      assert.ok([200, 404].includes(denied.response.status));
      assert.ok(denied.html.includes("Page not found"));
      assert.ok(!denied.html.includes("Shared invoice contact"));
      assert.ok(
        (
          await staff.client.rpc("transition_invoice", {
            ...issue(sharedFirst),
            p_action: "void",
            p_version: 2,
            p_reason: "Unauthorized refund",
          })
        ).error,
      );
      assert.ok(
        (
          await other.client.rpc("invoice_details", {
            p_tenant: tenant,
            p_invoice: sharedFirst,
          })
        ).error,
      );
      assert.ok(
        (await owner.client.rpc("invoice_directory", { p_tenant: foreign }))
          .error,
      );
      const editable = await create({});
      const forged = await app.post(
        `/finance/invoices/${editable}/edit`,
        "Save invoice draft",
        { ...values, tenant_id: foreign },
      );
      assert.equal(forged.response.status, 200);
      assert.ok(forged.html.includes("Business changed"));
      assert.ok(
        (await owner.client.from("invoice_receivable_entries").select("*"))
          .error,
      );
    },
  );
  await t.test(
    "cash ledger remains unchanged, and historical invoice access does not depend on current customer archive",
    async () => {
      const cash = await rpc(owner, "cashbox_details", {
        p_tenant: tenant,
        p_cashbox: box,
      });
      assert.equal(cash.balance, "10.00");
      assert.equal(cash.total, 1);
      await rpc(owner, "archive_customer", {
        p_tenant: tenant,
        p_customer: customer,
        p_archive: true,
      });
      const page = await app.get(`/finance/invoices/${invoice}`);
      assert.equal(page.response.status, 200);
      assert.ok(page.html.includes("Invoice student"));
      const archived = await owner.client.rpc("save_invoice_draft", {
        p_tenant: tenant,
        p_invoice: null,
        p_request: randomUUID(),
        p_version: 0,
        p_data: data,
        p_items: lines,
      });
      assert.ok(archived.error);
      await rpc(owner, "save_employee", {
        p_tenant: tenant,
        p_id: employee,
        p_full_name: "Billing staff",
        p_phone: "",
        p_email: staff.email,
        p_job_title: "Cashier",
        p_status: "inactive",
        p_start_date: "2026-10-23",
        p_notes: "Local invoice fixture",
        p_branches: [branch],
      });
      assert.ok(
        (
          await staff.client.rpc("invoice_details", {
            p_tenant: tenant,
            p_invoice: sharedFirst,
          })
        ).error,
      );
    },
  );
});
