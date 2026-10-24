import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
import { localDateTime } from "../../src/lib/time.mjs";
test("local expense/transfer/refund forms, private receipts and posting races", async (t) => {
  const owner = await localAccount("operations-owner"),
    outsider = await localAccount("operations-outsider");
  const tenant = await rpc(owner, "create_business", {
    p_name: "Operations live " + randomUUID().slice(0, 8),
  });
  const branch = (
    await owner.client
      .from("branches")
      .select("id")
      .eq("tenant_id", tenant)
      .single()
  ).data.id;
  const box = async (name) =>
    rpc(owner, "save_cashbox", {
      p_tenant: tenant,
      p_id: null,
      p_request: randomUUID(),
      p_data: { branch_id: branch, name, cashbox_type: "cash" },
    });
  const source = await box("Source drawer"),
    destination = await box("Destination drawer");
  await rpc(owner, "post_cashbox_entry", {
    p_tenant: tenant,
    p_cashbox: source,
    p_request: randomUUID(),
    p_kind: "opening_balance",
    p_amount: "100",
    p_reason: "Local operation reserve",
  });
  const app = renderedApp(owner, tenant, branch),
    categories = await rpc(owner, "expense_category_directory", {
      p_tenant: tenant,
    });
  const at = () => localDateTime(new Date().toISOString(), "Asia/Tashkent");
  const balance = async (id) =>
    (await rpc(owner, "cashbox_details", { p_tenant: tenant, p_cashbox: id }))
      .balance;
  let expense;
  await t.test(
    "rendered expense action saves an exact outflow and source record",
    async () => {
      const r = await app.post(
        "/finance/expenses/new?branch=" + branch,
        "Post expense",
        {
          cashbox_id: source,
          category_id: categories[0].id,
          amount: "10.10",
          occurred_at: at(),
          reason: "Local office purchase",
          vendor: "Office shop",
          confirm_finance: "on",
        },
      );
      assert.equal(r.response.status, 303, r.html.slice(0, 500));
      expense = r.response.headers
        .get("location")
        .match(/expenses\/([0-9a-f-]{36})/)[1];
      assert.equal(await balance(source), "89.90");
      const d = await app.get("/finance/expenses/" + expense);
      assert.ok(d.html.includes("Local office purchase"));
    },
  );
  await t.test(
    "receipts remain private, cannot be overwritten and cannot be read or attached by another tenant",
    async () => {
      const path = `${tenant}/expenses/${expense}/${randomUUID()}.pdf`,
        bytes = new TextEncoder().encode("%PDF-1.4\nLocal QA receipt");
      const uploaded = await owner.client.storage
        .from("finance-receipts")
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      assert.ifError(uploaded.error);
      assert.ok(
        (
          await owner.client.storage
            .from("finance-receipts")
            .upload(path, bytes, {
              contentType: "application/pdf",
              upsert: true,
            })
        ).error,
      );
      assert.ok(
        (await outsider.client.storage.from("finance-receipts").download(path))
          .error,
      );
      assert.ok(
        (
          await outsider.client.storage
            .from("finance-receipts")
            .upload(
              `${tenant}/expenses/${expense}/${randomUUID()}.pdf`,
              bytes,
              { contentType: "application/pdf" },
            )
        ).error,
      );
      const signed = await owner.client.storage
        .from("finance-receipts")
        .createSignedUrl(path, 60);
      assert.ifError(signed.error);
      assert.equal((await fetch(signed.data.signedUrl)).status, 200);
      const page = await app.get(`/finance/expenses/${expense}`);
      assert.ok(page.html.includes("Download receipt"));
      assert.ok(page.html.includes(path.split("/").at(-1)));
    },
  );
  await t.test(
    "rendered transfer posts both legs; concurrent overspending permits only one transfer",
    async () => {
      const r = await app.post("/finance/transfers/new", "Post transfer", {
        source_id: source,
        destination_id: destination,
        amount: "9.90",
        occurred_at: at(),
        reason: "Supply second drawer",
        confirm_finance: "on",
      });
      assert.equal(r.response.status, 303, r.html.slice(0, 500));
      assert.equal(await balance(source), "80.00");
      assert.equal(await balance(destination), "9.90");
      const command = () =>
        owner.client.rpc("post_cashbox_transfer", {
          p_tenant: tenant,
          p_request: randomUUID(),
          p_source: source,
          p_destination: destination,
          p_amount: "50",
          p_at: new Date().toISOString(),
          p_reason: "Concurrent actual transfer",
        });
      const result = await Promise.all([command(), command()]);
      assert.equal(result.filter((r) => !r.error).length, 1);
      assert.equal(await balance(source), "30.00");
      assert.equal(await balance(destination), "59.90");
    },
  );
  await t.test(
    "rendered reversal preserves source and exactly restores its cash outflow",
    async () => {
      const d = await rpc(owner, "financial_operation_details", {
        p_tenant: tenant,
        p_kind: "expense",
        p_id: expense,
      });
      const r = await app.post(
        `/finance/transactions/${d.transaction_id}`,
        "Reverse posting",
        {
          occurred_at: at(),
          reason: "Correct office purchase entry",
          confirm_finance: "on",
        },
      );
      assert.equal(r.response.status, 303, r.html.slice(0, 500));
      assert.equal(await balance(source), "40.10");
      assert.equal(
        (
          await rpc(owner, "financial_operation_details", {
            p_tenant: tenant,
            p_kind: "expense",
            p_id: expense,
          })
        ).reversed,
        true,
      );
    },
  );
  await t.test(
    "partial/full refund forms unwind allocations and reopen invoice debt",
    async () => {
      const customer = await rpc(owner, "save_customer", {
        p_tenant: tenant,
        p_id: null,
        p_profile: { first_name: "Refund payer", phone: "998901001" },
        p_branches: [branch],
      });
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const invoice = await rpc(owner, "save_invoice_draft", {
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
          cashbox_id: source,
          amount: "100",
          method: "cash",
          paid_at: today + "T00:00:00+05:00",
        },
        p_allocations: [{ invoice_id: invoice, amount: "100" }],
      });
      for (const amount of ["40", "60"]) {
        const r = await app.post(
          `/finance/payments/${payment}`,
          "Post refund",
          {
            cashbox_id: source,
            amount,
            occurred_at: at(),
            reason: "Requested customer refund",
            confirm_finance: "on",
          },
        );
        assert.equal(r.response.status, 303, r.html.slice(0, 500));
      }
      assert.equal(
        (
          await rpc(owner, "invoice_details", {
            p_tenant: tenant,
            p_invoice: invoice,
          })
        ).outstanding,
        "100.00",
      );
      const d = await rpc(owner, "payment_details", {
        p_tenant: tenant,
        p_payment: payment,
      });
      assert.equal(d.refundable, "0.00");
      assert.equal(d.payment.credit, "0.00");
      assert.equal(d.refunds.length, 2);
      assert.equal(await balance(source), "40.10");
      assert.ok(
        (
          await outsider.client.rpc("post_payment_refund", {
            p_tenant: tenant,
            p_payment: payment,
            p_request: randomUUID(),
            p_cashbox: source,
            p_amount: "1",
            p_at: new Date().toISOString(),
            p_reason: "Foreign refund attempt",
          })
        ).error,
      );
    },
  );
});
