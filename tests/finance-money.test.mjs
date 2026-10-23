import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, moneyInput } from "../src/features/finance/money.mjs";

test("money inputs and display preserve exact decimal strings at and beyond JS safe-integer boundaries", () => {
  assert.equal(moneyInput("9999999999999999.99"), "9999999999999999.99");
  assert.equal(moneyInput("1.2"), "1.20");
  assert.equal(moneyInput("-0.01", true), "-0.01");
  assert.equal(
    formatMoney("10000000000000000.00"),
    "10,000,000,000,000,000.00 UZS",
  );
  assert.equal(formatMoney("-0.01"), "−0.01 UZS");
  assert.equal(formatMoney("0"), "0.00 UZS");
  for (const amount of [
    "0",
    "-0",
    "-0.00",
    "1.001",
    "10000000000000000",
    "1e2",
    "NaN",
    "1,000",
    "01",
    " 1",
    "",
  ])
    assert.throws(() => moneyInput(amount, true));
  assert.throws(() => moneyInput("-1"));
  assert.throws(() => formatMoney("1.001"));
});
