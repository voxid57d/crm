// @ts-check
import { InputError } from "../../lib/validation.mjs";

/** Validate and normalize without converting money to a JavaScript Number.
 * @param {string} value
 * @param {boolean} [signed]
 */
export function moneyInput(value, signed = false) {
  if (!/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value))
    throw new InputError(
      "Use up to 16 integer digits and 2 decimal places, without commas.",
    );
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(
    ".",
  );
  const decimals = fraction.padEnd(2, "0");
  if ((integer === "0" && decimals === "00") || (negative && !signed))
    throw new InputError(
      signed ? "Amount must be nonzero." : "Amount must be positive.",
    );
  return `${negative ? "-" : ""}${integer}.${decimals}`;
}

/** PostgreSQL decimal text in, formatted text out; no float conversion or math.
 * Aggregate balances may exceed the size of an individual ledger movement.
 * @param {string} value
 * @param {string} [currency]
 */
export function formatMoney(value, currency = "UZS") {
  if (!/^-?[0-9]+(\.[0-9]{1,2})?$/.test(value))
    throw new Error("Invalid exact monetary value.");
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(
    ".",
  );
  return `${negative ? "−" : ""}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")} ${currency}`;
}
