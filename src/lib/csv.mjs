// @ts-check
/** @param {unknown} value */
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^\s*[=+@-]/.test(s) && !/^-[0-9]+(?:\.[0-9]{1,2})?$/.test(s))
    s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
/** @param {{key:string,label:string}[]} columns @param {Record<string,string|null>[]} rows */
export function reportCsv(columns, rows) {
  return (
    "\uFEFF" +
    [
      columns.map((c) => csvCell(c.label)).join(","),
      ...rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(",")),
    ].join("\r\n") +
    "\r\n"
  );
}
