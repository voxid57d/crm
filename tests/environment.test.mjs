import test from "node:test";
import assert from "node:assert/strict";
import { inspectEnvironment } from "../src/lib/config/environment.mjs";

const local = {
  url: "http://127.0.0.1:54321",
  key: "sb_publishable_test",
  nodeEnv: "development",
};
test("missing configuration remains an explicit setup state", () => {
  assert.equal(inspectEnvironment({}).status, "missing");
});
test("local development accepts loopback and blocks remote URLs by default", () => {
  assert.equal(inspectEnvironment(local).status, "ready");
  assert.equal(
    inspectEnvironment({ ...local, url: "https://example.supabase.co" }).status,
    "invalid",
  );
});
test("production builds accept local services; hosted deployment requires HTTPS", () => {
  assert.equal(
    inspectEnvironment({ ...local, nodeEnv: "production" }).status,
    "ready",
  );
  assert.equal(
    inspectEnvironment({
      ...local,
      nodeEnv: "production",
      url: "http://example.supabase.co",
    }).status,
    "invalid",
  );
  assert.equal(
    inspectEnvironment({
      ...local,
      nodeEnv: "production",
      url: "https://example.supabase.co",
    }).status,
    "ready",
  );
});
test("public configuration rejects secret and legacy service-role keys", () => {
  const jwt = (role) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.equal(
    inspectEnvironment({ ...local, key: "sb_secret_test" }).status,
    "invalid",
  );
  assert.equal(
    inspectEnvironment({ ...local, key: jwt("service_role") }).status,
    "invalid",
  );
  assert.equal(
    inspectEnvironment({ ...local, key: jwt("anon") }).status,
    "ready",
  );
});
test("invalid protocols and embedded credentials are rejected", () => {
  for (const url of [
    "file:///tmp/db",
    "not a url",
    "https://user:password@example.com",
  ]) {
    assert.equal(inspectEnvironment({ ...local, url }).status, "invalid");
  }
});
