import test from "node:test";
import assert from "node:assert/strict";
import { financePeriod } from "../src/features/finance/period.mjs";
test("finance today/week/month presets follow business timezone and Monday week boundary", () => {
  const now = new Date("2026-10-25T20:30:00Z");
  assert.deepEqual(financePeriod(now, "Asia/Tashkent", "today"), {
    from: "2026-10-26",
    to: "2026-10-26",
  });
  assert.equal(financePeriod(now, "Asia/Tashkent", "week").from, "2026-10-26");
  assert.equal(financePeriod(now, "Asia/Tashkent", "month").from, "2026-10-01");
  assert.equal(
    financePeriod(new Date("2026-11-01T12:00:00Z"), "Asia/Tashkent", "week")
      .from,
    "2026-10-26",
  );
});
