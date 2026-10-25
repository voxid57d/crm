import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  calendarPeriod,
} from "../src/features/academics/calendar.mjs";
test("calendar date arithmetic is independent of DST and keeps complete Monday-first periods", () => {
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.throws(() => addDays("2026-02-30", 1));
  const week = calendarPeriod("2026-01-01", "week");
  assert.equal(week.from, "2025-12-29");
  assert.equal(week.to, "2026-01-04");
  assert.equal(week.days.length, 7);
  const month = calendarPeriod("2026-08-15", "month");
  assert.equal(month.from, "2026-07-27");
  assert.equal(month.to, "2026-09-06");
  assert.equal(month.days.length, 42);
  assert.equal(month.previous, "2026-07-01");
  assert.equal(month.next, "2026-09-01");
  assert.deepEqual(calendarPeriod("2026-12-31", "day").days, ["2026-12-31"]);
  assert.equal(calendarPeriod("2026-12-31", "month").next, "2027-01-01");
  assert.throws(() => calendarPeriod("2026-01-01", "other"));
});
