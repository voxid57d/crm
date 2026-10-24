import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAccount, rpc, renderedApp } from "../helpers/local-app.mjs";
test("student-first local forms, conversion, financial continuity and authorization", async (t) => {
  const owner = await localAccount("student-first-owner"),
    other = await localAccount("student-first-other"),
    staff = await localAccount("student-first-viewer");
  const tenant = await rpc(owner, "create_business", {
      p_name: "Student first live " + randomUUID().slice(0, 8),
    }),
    foreign = await rpc(other, "create_business", {
      p_name: "Foreign student business",
    });
  const branch = (
      await owner.client
        .from("branches")
        .select("id")
        .eq("tenant_id", tenant)
        .single()
    ).data.id,
    foreignBranch = (
      await other.client
        .from("branches")
        .select("id")
        .eq("tenant_id", foreign)
        .single()
    ).data.id;
  const second = (
    await owner.client
      .from("branches")
      .insert({ tenant_id: tenant, name: "Hidden student branch" })
      .select("id")
      .single()
  ).data.id;
  const app = renderedApp(owner, tenant, branch),
    otherApp = renderedApp(other, foreign, foreignBranch),
    staffApp = renderedApp(staff, tenant, branch);
  const profile = {
    first_name: "One-form student",
    phone: "998903334444",
    branch_ids: [branch],
    education_status: "active",
    student_identifier: "",
  };
  const count = async (table) => {
    const r = await owner.client
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant);
    assert.ifError(r.error);
    return r.count;
  };
  const lead = async (name, phone = "998901110001", b = tenant) => {
    const pipeline = (
      await owner.client
        .from("sales_pipelines")
        .select("id")
        .eq("tenant_id", b)
        .eq("is_default", true)
        .single()
    ).data.id;
    const stage = (
      await owner.client
        .from("sales_stages")
        .select("id")
        .eq("tenant_id", b)
        .eq("pipeline_id", pipeline)
        .eq("outcome", "open")
        .order("position")
        .limit(1)
        .single()
    ).data.id;
    return rpc(owner, "save_lead", {
      p_tenant: b,
      p_id: null,
      p_data: {
        branch_id: b === tenant ? branch : genericBranch,
        pipeline_id: pipeline,
        stage_id: stage,
        first_name: name,
        phone,
      },
    });
  };
  let student, existing, guardian, genericBranch;
  await t.test(
    "Add Student form creates one shared identity and profile then opens the student route",
    async () => {
      const r = await app.post("/students/new", "Create student", {
        ...profile,
        student_enabled: "",
      });
      assert.equal(r.response.status, 303, r.html.slice(0, 1000));
      student = r.response.headers
        .get("location")
        .match(/students\/([0-9a-f-]{36})/)[1];
      const c = await owner.client
          .from("customers")
          .select("*")
          .eq("id", student)
          .single(),
        s = await owner.client
          .from("student_profiles")
          .select("*")
          .eq("customer_id", student)
          .single();
      assert.ifError(c.error);
      assert.ifError(s.error);
      assert.equal(c.data.first_name, profile.first_name);
      assert.match(s.data.student_identifier, /^ST-/);
      const page = await app.get("/students/" + student);
      for (const value of [
        "One-form student",
        "Parents &amp; guardians",
        "Financial information",
        "Activity history",
        "Edit student",
      ])
        assert.ok(page.html.includes(value), value);
      const directory = await app.get("/students");
      assert.ok(directory.html.includes("/students/" + student));
      assert.ok(directory.html.includes("Add Student"));
      assert.ok(!directory.html.includes("Add customer / student"));
    },
  );
  await t.test(
    "invalid saves and duplicate attempts leave no partial identity or student",
    async () => {
      const before = await count("customers");
      const invalid = await app.post("/students/new", "Create student", {
        ...profile,
        first_name: "Broken student",
        phone: "998900001111",
        education_status: "not-valid",
      });
      assert.equal(invalid.response.status, 200);
      assert.ok(invalid.html.includes("Student could not save"));
      assert.equal(await count("customers"), before);
      const duplicate = await app.post(
        "/students/new",
        "Create student",
        profile,
      );
      assert.equal(duplicate.response.status, 200);
      assert.ok(
        duplicate.html.includes("Possible existing contact or student"),
      );
      assert.equal(await count("customers"), before);
    },
  );
  await t.test(
    "promote existing contact through one form and retain invoice/payment/refund links and exact credit",
    async () => {
      existing = await rpc(owner, "save_customer", {
        p_tenant: tenant,
        p_id: null,
        p_profile: {
          first_name: "Existing payer contact",
          phone: "998904440001",
        },
        p_branches: [branch],
      });
      const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        at = date + "T12:00:00+05:00";
      const invoice = await rpc(owner, "save_invoice_draft", {
        p_tenant: tenant,
        p_invoice: null,
        p_request: randomUUID(),
        p_version: 0,
        p_data: {
          branch_id: branch,
          customer_id: existing,
          issue_date: date,
          due_date: date,
          discount_amount: "0",
        },
        p_items: [
          {
            description: "Preserved charge",
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
      const box = await rpc(owner, "save_cashbox", {
        p_tenant: tenant,
        p_id: null,
        p_request: randomUUID(),
        p_data: {
          name: "Student continuity cashbox",
          branch_id: branch,
          cashbox_type: "cash",
        },
      });
      const payment = await rpc(owner, "post_payment", {
        p_tenant: tenant,
        p_request: randomUUID(),
        p_data: {
          branch_id: branch,
          customer_id: existing,
          cashbox_id: box,
          amount: "60.10",
          paid_at: at,
          method: "cash",
        },
        p_allocations: [{ invoice_id: invoice, amount: "40" }],
      });
      await rpc(owner, "post_payment_refund", {
        p_tenant: tenant,
        p_payment: payment,
        p_request: randomUUID(),
        p_cashbox: box,
        p_amount: "5",
        p_at: at,
        p_reason: "Preserved student refund",
      });
      const before = await rpc(owner, "customer_financial_profile", {
          p_tenant: tenant,
          p_customer: existing,
        }),
        n = await count("customers");
      const r = await app.post(
        "/students/new?existing=" + existing,
        "Create student",
        {
          first_name: "Existing payer contact",
          phone: "998904440001",
          branch_ids: [branch],
          education_status: "active",
          student_identifier: "",
        },
      );
      assert.equal(r.response.status, 303, r.html.slice(0, 1000));
      assert.ok(
        r.response.headers.get("location").includes("/students/" + existing),
      );
      assert.equal(await count("customers"), n);
      assert.deepEqual(
        await rpc(owner, "customer_financial_profile", {
          p_tenant: tenant,
          p_customer: existing,
        }),
        before,
      );
      assert.equal(before.summary.outstanding, "60.00");
      assert.equal(before.payment_summary.credit, "15.10");
      const page = await app.get("/students/" + existing);
      for (const value of [
        "Payment history and credit",
        "Preserved student refund",
        "Refund history",
        `/finance/invoices/${invoice}`,
      ])
        assert.ok(page.html.includes(value), value);
      const reuse = await app.get("/students/new?existing=" + existing);
      if (reuse.response.status === 307)
        assert.equal(
          reuse.response.headers.get("location"),
          "/students/" + existing,
        );
      else {
        assert.equal(reuse.response.status, 200);
        assert.ok(
          (reuse.html.match(/<meta\b[^>]*>/g) ?? []).some(
            (tag) =>
              tag.includes('http-equiv="refresh"') &&
              tag.includes(`url=/students/${existing}`),
          ),
          "Streamed redirect opens the existing student",
        );
      }
    },
  );
  await t.test(
    "student edits and legacy contact URLs share authoritative details; guardians can be shared",
    async () => {
      const r = await app.post(`/students/${student}/edit`, "Save student", {
        ...profile,
        first_name: "Updated one-form student",
        education_status: "on_hold",
      });
      assert.equal(r.response.status, 303, r.html.slice(0, 500));
      const c = await owner.client
        .from("customers")
        .select("first_name")
        .eq("id", student)
        .single();
      assert.equal(c.data.first_name, "Updated one-form student");
      const stale = await app.post(
        `/students/${student}/edit`,
        "Save student",
        {
          ...profile,
          first_name: "Stale promotion overwrite",
          student_mode: "create",
        },
      );
      assert.equal(stale.response.status, 303);
      assert.equal(
        (
          await owner.client
            .from("customers")
            .select("first_name")
            .eq("id", student)
            .single()
        ).data.first_name,
        "Updated one-form student",
      );
      assert.ok(
        (await app.get("/customers/" + student)).html.includes(
          "Updated one-form student",
        ),
      );
      const g = await app.post("/students/" + student, "Add guardian", {
        full_name: "Shared parent",
        phone: "998908880001",
        email: "",
        relationship: "Parent",
        is_emergency: "on",
      });
      assert.equal(g.response.status, 200);
      assert.ok(g.html.includes("Guardian relationship saved"));
      guardian = (
        await owner.client
          .from("student_guardians")
          .select("guardian_id")
          .eq("customer_id", student)
          .single()
      ).data.guardian_id;
      const linked = await app.post(
        "/students/" + existing,
        "Link existing guardian",
        { guardian_id: guardian, relationship: "Parent" },
      );
      assert.equal(linked.response.status, 200);
      const links = await owner.client
        .from("student_guardians")
        .select("customer_id")
        .eq("guardian_id", guardian);
      assert.equal(links.data.length, 2);
      const classified = await owner.client
        .from("student_profiles")
        .select("*")
        .eq("customer_id", guardian);
      assert.equal(classified.data.length, 0);
    },
  );
  await t.test(
    "education lead conversion and concurrent retries create/link one student and preserve sales history",
    async () => {
      const l = await lead("Converted student live");
      const r = await app.post("/leads/" + l, "Convert lead", {
        confirm: "on",
        customer_id: "",
      });
      assert.equal(r.response.status, 303, r.html.slice(0, 800));
      const c = (
        await owner.client
          .from("leads")
          .select("customer_id,converted_at")
          .eq("id", l)
          .single()
      ).data.customer_id;
      assert.ok(r.response.headers.get("location").includes("/students/" + c));
      assert.equal(
        await rpc(owner, "convert_lead_to_student", {
          p_tenant: tenant,
          p_lead: l,
        }),
        c,
      );
      assert.ok(
        (await app.get("/students/" + c)).html.includes(
          "Linked lead conversions",
        ),
      );
      const racing = await lead("Concurrent converted student", "998901110002"),
        commands = () =>
          owner.client.rpc("convert_lead_to_student", {
            p_tenant: tenant,
            p_lead: racing,
          });
      const result = await Promise.all([commands(), commands()]);
      result.forEach((r) => assert.ifError(r.error));
      assert.equal(result[0].data, result[1].data);
      const linkLead = await lead("Link existing student", "998901110003");
      const linked = await app.post("/leads/" + linkLead, "Convert lead", {
        confirm: "on",
        customer_id: student,
      });
      assert.equal(linked.response.status, 303);
      assert.ok(
        linked.response.headers
          .get("location")
          .includes("/students/" + student),
      );
    },
  );
  await t.test(
    "historical generic conversions can explicitly gain a student profile without changing attribution",
    async () => {
      const l = await lead("Historical contact conversion", "998901110004");
      const c = await rpc(owner, "convert_lead", {
        p_tenant: tenant,
        p_lead: l,
      });
      const before = (
        await owner.client
          .from("leads")
          .select(
            "customer_id,converted_at,converted_by,source_id,assigned_employee_id,pipeline_id",
          )
          .eq("id", l)
          .single()
      ).data;
      const r = await app.post("/leads/" + l, "Add student profile", {});
      assert.equal(r.response.status, 303, r.html.slice(0, 500));
      assert.ok(r.response.headers.get("location").includes("/students/" + c));
      assert.deepEqual(
        (
          await owner.client
            .from("leads")
            .select(
              "customer_id,converted_at,converted_by,source_id,assigned_employee_id,pipeline_id",
            )
            .eq("id", l)
            .single()
        ).data,
        before,
      );
    },
  );
  await t.test(
    "student/guardian and financial confidentiality survives cross-tenant, branch and forged form IDs",
    async () => {
      const role = await rpc(owner, "save_business_role", {
        p_tenant: tenant,
        p_id: null,
        p_name: "Student reader",
        p_scope: "branch",
        p_permissions: ["branches.view", "customers.view"],
      });
      await rpc(owner, "assign_member_role", {
        p_tenant: tenant,
        p_user: staff.id,
        p_role: role,
        p_branches: [branch],
      });
      const visible = await staffApp.get("/students/" + existing);
      assert.ok(visible.html.includes("Existing payer contact"));
      assert.ok(visible.html.includes("Financial information is restricted"));
      assert.ok(!visible.html.includes("Preserved student refund"));
      assert.ok(!visible.html.includes("60.10"));
      const financial = await staffApp.get(`/students/${existing}/finance`);
      assert.ok(!financial.html.includes("Preserved charge"));
      const shared = await rpc(owner, "save_student", {
        p_tenant: tenant,
        p_request: randomUUID(),
        p_customer: null,
        p_profile: {
          first_name: "Hidden shared student",
          phone: "998905551111",
        },
        p_student: {},
        p_branches: [branch, second],
      });
      assert.ok(
        !(await staffApp.get("/students/" + shared)).html.includes(
          "Hidden shared student",
        ),
      );
      const raw = await staff.client
        .from("student_profiles")
        .select("*")
        .eq("customer_id", shared);
      assert.equal(raw.data.length, 0);
      assert.ok(
        !(await otherApp.get("/students/" + student)).html.includes(
          "Updated one-form student",
        ),
      );
      assert.equal(
        (await other.client.from("guardians").select("*").eq("id", guardian))
          .data.length,
        0,
      );
      assert.ok(
        (
          await staff.client.rpc("save_student", {
            p_tenant: tenant,
            p_request: randomUUID(),
            p_customer: null,
            p_profile: { first_name: "Denied", phone: "998905551122" },
            p_student: {},
            p_branches: [branch],
          })
        ).error,
      );
      const forged = await app.post("/students/new", "Create student", {
        ...profile,
        tenant_id: foreign,
      });
      assert.ok(forged.html.includes("Business changed. Reload before saving"));
      await rpc(owner, "save_business_role", {
        p_tenant: tenant,
        p_id: role,
        p_name: "Student reader",
        p_scope: "branch",
        p_permissions: [
          "branches.view",
          "customers.view",
          "payments.view",
          "cashboxes.view",
        ],
      });
      const paymentOnly = await staffApp.get(`/students/${existing}`);
      assert.ok(paymentOnly.html.includes("Preserved student refund"));
      assert.ok(paymentOnly.html.includes("Payment history and credit"));
      assert.ok(!paymentOnly.html.includes("/finance/invoices/"));
      const credit = await rpc(staff, "customer_payment_profile", {
        p_tenant: tenant,
        p_customer: existing,
      });
      assert.equal(credit.payment_summary.credit, "15.10");
    },
  );
  await t.test(
    "generic businesses retain contact conversion without creating students",
    async () => {
      const generic = await rpc(owner, "create_business", {
        p_name: "Generic retail business",
        p_business_type: "retail",
      });
      genericBranch = (
        await owner.client
          .from("branches")
          .select("id")
          .eq("tenant_id", generic)
          .single()
      ).data.id;
      const genericApp = renderedApp(owner, generic, genericBranch),
        l = await lead("Generic retail customer", "998901110005", generic);
      const r = await genericApp.post("/leads/" + l, "Convert lead", {
        confirm: "on",
        customer_id: "",
      });
      assert.equal(r.response.status, 200, r.html.slice(0, 500));
      assert.ok(r.html.includes("Lead converted and customer linked"));
      const students = await owner.client
        .from("student_profiles")
        .select("*")
        .eq("tenant_id", generic);
      assert.equal(students.data.length, 0);
    },
  );
  await t.test(
    "archived students stay accessible and restore from the same student profile",
    async () => {
      const r = await app.post("/students/" + student, "Archive student", {
        archive: "true",
      });
      assert.equal(r.response.status, 200);
      assert.ok(
        (await app.get("/students/archived")).html.includes(
          "Updated one-form student",
        ),
      );
      const restore = await app.post(
        "/students/" + student,
        "Restore student",
        { archive: "false" },
      );
      assert.equal(restore.response.status, 200);
      assert.ok(
        (await app.get("/students")).html.includes("Updated one-form student"),
      );
    },
  );
});
