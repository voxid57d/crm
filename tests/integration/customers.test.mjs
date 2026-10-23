import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { localAppOrigin } from "../../src/lib/validation.mjs";

test("real local customer/student CRUD, rendered forms and tenant/branch confidentiality", async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.ok(url && key, "Configure local Supabase first.");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  );
  assert.ok(!key.startsWith("sb_secret_"));
  if (key.split(".").length === 3)
    assert.equal(
      JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role,
      "anon",
    );
  const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL),
    suffix = randomUUID().slice(0, 8);
  const accounts = [];
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
    const email = `customer-live-${suffix}-${i}@example.test`;
    const auth = await client.auth.signUp({
      email,
      password: `Customer-live-${randomUUID()}!`,
      options: { data: { full_name: `Customer QA ${i}` } },
    });
    assert.ifError(auth.error);
    assert.ok(auth.data.session, "Default local signup must return a session.");
    accounts.push({ client, cookies, email, id: auth.data.user.id });
  }
  const rpc = async (account, name, args) => {
    const r = await account.client.rpc(name, args);
    assert.ifError(r.error);
    return r.data;
  };
  const [owner, other, staff] = accounts;
  const a = await rpc(owner, "create_business", {
    p_name: `Customer live A ${suffix}`,
  });
  const b = await rpc(other, "create_business", {
    p_name: `Customer live B ${suffix}`,
  });
  const first = await owner.client
    .from("branches")
    .select("id")
    .eq("tenant_id", a)
    .single();
  assert.ifError(first.error);
  const a1 = first.data.id;
  const second = await owner.client
    .from("branches")
    .insert({ tenant_id: a, name: "Other branch" })
    .select("id")
    .single();
  assert.ifError(second.error);
  const a2 = second.data.id;
  const cookies = (account, branch = a1) =>
    [...account.cookies, ["forma-tenant", a], ["forma-branch", branch]]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
  const get = async (path, account = owner, branch = a1) => {
    const r = await fetch(origin + path, {
      headers: { Cookie: cookies(account, branch) },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    return { response: r, html: await r.text() };
  };
  const decode = (value) =>
    value
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  const postForm = async (path, label, values, account = owner) => {
    const { response, html } = await get(path, account);
    assert.equal(response.status, 200);
    const forms = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? [];
    const form = forms.find((f) => f.includes(label));
    assert.ok(form, `Rendered form: ${label}`);
    const body = new FormData();
    for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
      if (!/type="hidden"/.test(input)) continue;
      const name = /name="([^"]*)"/.exec(input)?.[1],
        value = /value="([^"]*)"/.exec(input)?.[1] ?? "";
      if (name) body.append(decode(name), decode(value));
    }
    assert.ok(
      [...body.keys()].some((k) => k.startsWith("$ACTION_")),
      "Real Next.js server action metadata",
    );
    for (const [name, value] of Object.entries(values)) {
      body.delete(name);
      for (const item of Array.isArray(value) ? value : [value])
        body.append(name, item);
    }
    const r = await fetch(origin + path, {
      method: "POST",
      headers: { Cookie: cookies(account), Origin: origin },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    return { response: r, html: await r.text() };
  };
  let customer, guardian;
  await t.test(
    "Rendered creation form saves a real customer with student profile",
    async () => {
      const submitted = await postForm("/customers/new", "Create customer", {
        first_name: `Live Student ${suffix}`,
        last_name: "Karimov",
        phone: "+998 90 777 11 22",
        branch_ids: [a1],
        student_enabled: "on",
        student_identifier: `LIVE-${suffix}`,
        education_status: "active",
        school: "Local School",
      });
      assert.equal(
        submitted.response.status,
        303,
        submitted.html.slice(0, 150),
      );
      const location = submitted.response.headers.get("location");
      assert.match(location, /\/customers\/[0-9a-f-]+\?saved=1/);
      customer = location.split("/")[2].split("?")[0];
      const row = await owner.client
        .from("customers")
        .select("*")
        .eq("id", customer)
        .single();
      assert.ifError(row.error);
      assert.equal(row.data.email, null);
      const student = await owner.client
        .from("student_profiles")
        .select("*")
        .eq("customer_id", customer)
        .single();
      assert.ifError(student.error);
      assert.equal(student.data.student_identifier, `LIVE-${suffix}`);
    },
  );
  await t.test(
    "Rendered edit, settings, note and guardian forms persist real records",
    async () => {
      const edited = await postForm(
        `/customers/${customer}/edit`,
        "Save customer",
        {
          first_name: `Updated Live ${suffix}`,
          last_name: "Karimov",
          phone: "998907771122",
          branch_ids: [a1],
          student_enabled: "on",
          student_identifier: `LIVE-${suffix}`,
          education_status: "active",
          school: "Updated School",
        },
      );
      assert.equal(edited.response.status, 303);
      const note = await postForm(
        `/customers/${customer}`,
        "Record note / interaction",
        { body: `Confidential note ${suffix}`, note_kind: "call" },
      );
      assert.equal(note.response.status, 200);
      assert.ok(
        note.html.includes("Note saved with protected activity history"),
      );
      const guardianResult = await postForm(
        `/customers/${customer}`,
        "Add guardian",
        {
          full_name: `Guardian ${suffix}`,
          phone: "9989000000",
          relationship: "Parent",
          is_emergency: "on",
        },
      );
      assert.equal(guardianResult.response.status, 200);
      assert.ok(guardianResult.html.includes("Guardian relationship saved"));
      const links = await owner.client
        .from("student_guardians")
        .select("*")
        .eq("customer_id", customer);
      assert.ifError(links.error);
      guardian = links.data[0].guardian_id;
      const setting = await postForm("/customers/settings", "Create tag", {
        kind: "tag",
        name: `VIP ${suffix}`,
        is_active: "true",
      });
      assert.equal(setting.response.status, 200);
      assert.ok(setting.html.includes("Customer configuration saved"));
      const directory = await get(`/customers?q=Updated+Live+${suffix}`);
      assert.equal(directory.response.status, 200);
      assert.ok(directory.html.includes(`Updated Live ${suffix}`));
      const students = await get("/students");
      assert.equal(students.response.status, 200);
      assert.ok(students.html.includes(`LIVE-${suffix}`));
      const detail = await get(`/customers/${customer}`);
      assert.ok(detail.html.includes("Updated School"));
      assert.ok(detail.html.includes(`Guardian ${suffix}`));
      assert.ok(detail.html.includes("Customer QA 0"));
    },
  );
  await t.test(
    "Different branch roles preserve full-coverage checks; notes do not leak through HTML/audit",
    async () => {
      const viewer = await rpc(owner, "save_business_role", {
        p_tenant: a,
        p_id: null,
        p_name: "Customer contact viewer",
        p_scope: "branch",
        p_permissions: ["branches.view", "customers.view"],
      });
      await rpc(owner, "assign_member_role", {
        p_tenant: a,
        p_user: staff.id,
        p_role: viewer,
        p_branches: [a1],
      });
      const staffPage = await get(`/customers/${customer}`, staff);
      assert.equal(staffPage.response.status, 200);
      assert.ok(
        staffPage.html.includes(
          "Internal notes and their edit history are restricted",
        ),
      );
      assert.ok(!staffPage.html.includes(`Confidential note ${suffix}`));
      const notes = await staff.client.from("customer_notes").select("*");
      assert.ifError(notes.error);
      assert.equal(notes.data.length, 0);
      const audits = await staff.client
        .from("customer_activities")
        .select("*")
        .eq("notes_only", true);
      assert.ifError(audits.error);
      assert.equal(audits.data.length, 0);
      const shared = await rpc(owner, "save_customer", {
        p_tenant: a,
        p_id: null,
        p_profile: { first_name: `Hidden shared ${suffix}`, phone: "555777" },
        p_branches: [a1, a2],
      });
      const raw = await staff.client
        .from("customers")
        .select("*")
        .eq("id", shared);
      assert.ifError(raw.error);
      assert.equal(raw.data.length, 0);
      const hidden = await get(`/customers/${shared}`, staff);
      assert.ok(!hidden.html.includes(`Hidden shared ${suffix}`));
      assert.ok(
        (
          await staff.client.rpc("archive_customer", {
            p_tenant: a,
            p_customer: customer,
            p_archive: true,
          })
        ).error,
      );
    },
  );
  await t.test(
    "Cross-tenant IDs and forged server form tenant cannot bypass isolation",
    async () => {
      const raw = await other.client
        .from("customers")
        .select("*")
        .eq("tenant_id", a);
      assert.ifError(raw.error);
      assert.equal(raw.data.length, 0);
      assert.ok(
        (
          await other.client.rpc("save_customer", {
            p_tenant: a,
            p_id: customer,
            p_profile: { first_name: "Forged", phone: "123" },
            p_branches: [a1],
          })
        ).error,
      );
      assert.ok(
        (await owner.client.rpc("customer_directory", { p_tenant: b })).error,
      );
      const forged = await postForm(
        `/customers/${customer}`,
        "Record note / interaction",
        { tenant_id: b, body: "Forged tenant note", note_kind: "note" },
      );
      assert.equal(forged.response.status, 200);
      assert.ok(forged.html.includes("Business changed. Reload before saving"));
      const guardianRead = await other.client
        .from("guardians")
        .select("*")
        .eq("id", guardian);
      assert.ifError(guardianRead.error);
      assert.equal(guardianRead.data.length, 0);
    },
  );
  await t.test(
    "Archive and restore through real forms retain student, notes and guardians",
    async () => {
      const archived = await postForm(
        `/customers/${customer}`,
        "Archive customer",
        { archive: "true" },
      );
      assert.equal(archived.response.status, 200);
      assert.ok(
        archived.html.includes(
          "Customer archived. Records and history are retained",
        ),
      );
      const directory = await get("/customers/archived");
      assert.ok(directory.html.includes(`Updated Live ${suffix}`));
      const restored = await postForm(
        `/customers/${customer}`,
        "Restore customer",
        { archive: "false" },
      );
      assert.equal(restored.response.status, 200);
      assert.ok(restored.html.includes("Customer restored"));
      const final = await get(`/customers/${customer}`);
      assert.ok(final.html.includes(`Confidential note ${suffix}`));
      assert.ok(final.html.includes(`Guardian ${suffix}`));
    },
  );
});
