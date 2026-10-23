import test from "node:test";
import assert from "node:assert/strict";
import { localDateTime, zonedTimeToIso } from "../src/features/sales/time.mjs";
test("follow-up business-local time converts to exact UTC and round-trips", () => {
  assert.equal(
    zonedTimeToIso("2026-10-24T10:30", "Asia/Tashkent"),
    "2026-10-24T05:30:00.000Z",
  );
  assert.equal(
    localDateTime("2026-10-24T05:30:00.000Z", "Asia/Tashkent"),
    "2026-10-24T10:30",
  );
});
test("follow-up calendar validation rejects invalid dates and daylight-saving gaps", () => {
  assert.throws(() => zonedTimeToIso("2026-02-30T10:00", "Asia/Tashkent"));
  assert.throws(
    () => zonedTimeToIso("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
});
