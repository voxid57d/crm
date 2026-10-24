import test from "node:test";
import assert from "node:assert/strict";
import { financialDateTime, zonedTimeToIso } from "../src/lib/time.mjs";
test("financial timestamps preserve seconds without changing business timezone", () => {
  assert.equal(
    financialDateTime("2026-10-24T05:30:09.123Z", "Asia/Tashkent"),
    "2026-10-24T10:30:09",
  );
  assert.equal(
    zonedTimeToIso("2026-10-24T10:30:09", "Asia/Tashkent"),
    "2026-10-24T05:30:09.000Z",
  );
  assert.throws(() => zonedTimeToIso("2026-10-24T10:30:60", "Asia/Tashkent"));
  assert.throws(() => zonedTimeToIso("2026-02-30T10:30:09", "Asia/Tashkent"));
});
