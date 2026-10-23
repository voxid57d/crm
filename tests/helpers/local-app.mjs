import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { localAppOrigin } from "../../src/lib/validation.mjs";

export async function localAccount(prefix) {
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
  const email = `${prefix}-${randomUUID().slice(0, 8)}@example.test`,
    r = await client.auth.signUp({
      email,
      password: `Local-qa-${randomUUID()}!`,
      options: { data: { full_name: prefix } },
    });
  assert.ifError(r.error);
  assert.ok(r.data.session);
  return { client, cookies, email, id: r.data.user.id };
}
export async function rpc(account, name, args) {
  const r = await account.client.rpc(name, args);
  assert.ifError(r.error);
  return r.data;
}
export function renderedApp(account, tenant, branch) {
  const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const cookie = () =>
    [...account.cookies, ["forma-tenant", tenant], ["forma-branch", branch]]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
  const get = async (path) => {
    const response = await fetch(origin + path, {
      headers: { Cookie: cookie() },
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
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
  const post = async (path, label, values) => {
    const page = await get(path);
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
      for (const item of Array.isArray(value) ? value : [value])
        body.append(name, item);
    }
    const response = await fetch(origin + path, {
      method: "POST",
      body,
      headers: { Cookie: cookie(), Origin: origin },
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    return { response, html: await response.text() };
  };
  return { get, post };
}
