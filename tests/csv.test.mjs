import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, reportCsv } from "../src/lib/csv.mjs";
test("CSV quotes delimiters/newlines and protects formulas while preserving exact decimal text", () => {
  assert.equal(csvCell('a,"b\nc'), '"a,""b\nc"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  for (const s of ["+cmd", "@SUM(A1:A2)", "  =1+2", "-1+2"])
    assert.ok(csvCell(s).startsWith("\"'"));
  assert.equal(csvCell("-123.45"), '"-123.45"');
  assert.equal(csvCell("9007199254740993.01"), '"9007199254740993.01"');
  assert.equal(
    reportCsv(
      [{ key: "amount", label: "Amount" }],
      [{ amount: "9007199254740993.01" }],
    ),
    '\uFEFF"Amount"\r\n"9007199254740993.01"\r\n',
  );
});
