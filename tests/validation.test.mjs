import test from "node:test";
import assert from "node:assert/strict";
import {
  email,
  password,
  uuid,
  safeNext,
  localAppOrigin,
} from "../src/lib/validation.mjs";

test("auth callback rejects open redirects and remote origins", () => {
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/admin",
    "/dashboard?next=https://evil.test",
  ])
    assert.equal(safeNext(value), "/businesses");
  assert.equal(safeNext("/reset-password"), "/reset-password");
  assert.throws(() => localAppOrigin("https://production.example"));
  assert.equal(
    localAppOrigin("http://127.0.0.1:3000/path"),
    "http://127.0.0.1:3000",
  );
});
test("server input validation rejects malformed IDs, emails, and mismatched passwords", () => {
  assert.throws(() => uuid("not-an-id"));
  const form = new FormData();
  form.set("email", "invalid");
  assert.throws(() => email(form));
  form.set("password", "a strong password");
  form.set("confirm_password", "different");
  assert.throws(() => password(form));
  form.set("confirm_password", "a strong password");
  assert.equal(password(form), "a strong password");
});
