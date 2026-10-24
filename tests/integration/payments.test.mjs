import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
import { localDateTime } from "../../src/lib/time.mjs";
test("local payment forms, allocation concurrency and real cash/debt", async (t) => {
  const owner = await localAccount("payments-live-owner"),
    outsider = await localAccount("payments-live-other");
  const tenant = await rpc(owner, "create_business", {
    p_name: "Payment live " + randomUUID().slice(0, 8),
  });
  const r = await owner.client
    .from("branches")
    .select("id")
    .eq("tenant_id", tenant)
    .single();
  assert.ifError(r.error);
  const branch = r.data.id;
  const customer = await rpc(owner, "save_customer", {
    p_tenant: tenant,
    p_id: null,
    p_profile: { first_name: "Live payer", phone: "998901234" },
    p_branches: [branch],
  });
  const box = await rpc(owner, "save_cashbox", {
    p_tenant: tenant,
    p_id: null,
    p_request: randomUUID(),
    p_data: {
      branch_id: branch,
      name: "Live payment drawer",
      cashbox_type: "cash",
    },
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const invoice = async () => {
    const id = await rpc(owner, "save_invoice_draft", {
      p_tenant: tenant,
      p_invoice: null,
      p_request: randomUUID(),
      p_version: 0,
      p_data: {
        branch_id: branch,
        customer_id: customer,
        issue_date: today,
        due_date: today,
        discount_amount: "0",
      },
      p_items: [
        {
          description: "Tuition",
          quantity: "1",
          unit_price: "100",
          discount_amount: "0",
        },
      ],
    });
    await rpc(owner, "transition_invoice", {
      p_tenant: tenant,
      p_invoice: id,
      p_request: randomUUID(),
      p_version: 1,
      p_action: "issue",
    });
    return id;
  };
  const a = await invoice(),
    b = await invoice(),
    app = renderedApp(owner, tenant, branch);
  const detail = (id) =>
    rpc(owner, "payment_details", { p_tenant: tenant, p_payment: id });
  let payment;
  await t.test(
    "rendered payment saves funds, partial allocation and customer credit atomically",
    async () => {
      const posted = await app.post(
        `/finance/payments/new?customer=${customer}&branch=${branch}`,
        "Post payment",
        {
          customer_id: customer,
          cashbox_id: box,
          amount: "80.10",
          method: "cash",
          occurred_at: localDateTime(new Date().toISOString(), "Asia/Tashkent"),
          allocation_invoice: [a],
          allocation_amount: ["50"],
          confirm_finance: "on",
        },
      );
      assert.equal(posted.response.status, 303, posted.html.slice(0, 180));
      payment = posted.response.headers
        .get("location")
        .split("/")[3]
        .split("?")[0];
      assert.equal((await detail(payment)).payment.credit, "30.10");
      assert.equal(
        (
          await rpc(owner, "invoice_details", {
            p_tenant: tenant,
            p_invoice: a,
          })
        ).outstanding,
        "50.00",
      );
      assert.ok(
        (await app.get("/finance/payments")).html.includes("80.10 UZS"),
      );
    },
  );
  await t.test(
    "rendered allocate/release actions update debt without changing cash",
    async () => {
      const allocated = await app.post(
        `/finance/payments/${payment}`,
        "Allocate credit",
        { invoice_id: b, amount: "20", confirm_finance: "on" },
      );
      assert.equal(allocated.response.status, 303);
      const allocation = (await detail(payment)).allocations.find(
        (a) => a.invoice_id === b,
      );
      const released = await app.post(
        `/finance/payments/${payment}`,
        "Release allocation",
        {
          invoice_id: b,
          original: allocation.id,
          amount: "5",
          reason: "Correct allocation",
          confirm_finance: "on",
        },
      );
      assert.equal(released.response.status, 303);
      assert.equal((await detail(payment)).payment.credit, "15.10");
      assert.equal(
        (
          await rpc(owner, "cashbox_details", {
            p_tenant: tenant,
            p_cashbox: box,
          })
        ).balance,
        "80.10",
      );
      assert.ok(
        (await app.get(`/customers/${customer}/finance`)).html.includes(
          "15.10 UZS",
        ),
      );
    },
  );
  await t.test(
    "concurrent allocations cannot overspend payment credit or overpay an invoice",
    async () => {
      const args = {
        p_tenant: tenant,
        p_payment: payment,
        p_invoice: b,
        p_amount: "10",
      };
      const attempts = await Promise.all([
        owner.client.rpc("allocate_payment", {
          ...args,
          p_request: randomUUID(),
        }),
        owner.client.rpc("allocate_payment", {
          ...args,
          p_request: randomUUID(),
        }),
      ]);
      assert.equal(attempts.filter((r) => !r.error).length, 1);
      assert.equal(attempts.filter((r) => r.error).length, 1);
      const key = randomUUID(),
        same = {
          p_tenant: tenant,
          p_payment: payment,
          p_invoice: a,
          p_amount: "5",
          p_request: key,
        };
      const retries = await Promise.all([
        owner.client.rpc("allocate_payment", same),
        owner.client.rpc("allocate_payment", same),
      ]);
      for (const result of retries) assert.ifError(result.error);
      assert.equal(retries[0].data, retries[1].data);
      assert.equal((await detail(payment)).payment.credit, "0.10");
    },
  );
  await t.test(
    "foreign identities and manipulated form business cannot bypass payment authorization",
    async () => {
      assert.ok(
        (
          await outsider.client.rpc("payment_details", {
            p_tenant: tenant,
            p_payment: payment,
          })
        ).error,
      );
      const forged = await app.post(
        `/finance/payments/${payment}`,
        "Allocate credit",
        {
          tenant_id: randomUUID(),
          invoice_id: b,
          amount: "0.01",
          confirm_finance: "on",
        },
      );
      assert.equal(forged.response.status, 200);
      assert.ok(forged.html.includes("Business changed"));
      assert.equal((await detail(payment)).payment.credit, "0.10");
      assert.ok((await owner.client.from("payments").select("*")).error);
    },
  );
});
