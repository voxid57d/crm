// @ts-check
export class InputError extends Error {}

/**
 * @param {FormData} form
 * @param {string} name
 * @param {{ min?: number; max?: number; label?: string }} [options]
 */
export function text(form, name, { min = 0, max = 150, label = name } = {}) {
  const value = form.get(name);
  if (value !== null && typeof value !== "string")
    throw new InputError(`${label} must be text.`);
  const result = (value ?? "").trim();
  if (result.length < min || result.length > max)
    throw new InputError(`${label} must contain ${min}–${max} characters.`);
  return result;
}

/**
 * @param {FormData} form
 * @param {string} [name]
 * @param {boolean} [optional]
 */
export function email(form, name = "email", optional = false) {
  const value = text(form, name, {
    min: optional ? 0 : 3,
    max: 254,
    label: "Email",
  });
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw new InputError("Enter a valid email address.");
  return value;
}

/** @param {FormData} form */
export function password(form) {
  const value = form.get("password");
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new InputError("Use a password with 12–128 characters.");
  if (form.has("confirm_password") && value !== form.get("confirm_password"))
    throw new InputError("Passwords do not match.");
  return value;
}

/** @param {unknown} value @returns {string} */
export function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new InputError("Invalid workspace or branch identifier.");
  return value;
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeNext(value, fallback = "/businesses") {
  // Keep callback destinations explicit: no arbitrary same-origin URL parsing.
  return typeof value === "string" &&
    ["/businesses", "/dashboard", "/reset-password"].includes(value)
    ? value
    : fallback;
}

/** @param {string | undefined} value */
export function localAppOrigin(value) {
  const url = new URL(value || "http://127.0.0.1:3000");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new InputError(
      "This development phase requires a local application origin.",
    );
  return url.origin;
}
