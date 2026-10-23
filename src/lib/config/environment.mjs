/** Validate without revealing keys; kept pure for configuration tests. */
export function inspectEnvironment({ url, key, nodeEnv }) {
  if (!url || !key)
    return {
      status: "missing",
      message: "Local Supabase needs a URL and publishable key.",
    };
  try {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error();
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (nodeEnv !== "production" && !local) {
      return {
        status: "invalid",
        message: "Remote Supabase is blocked during local development.",
      };
    }
    if (nodeEnv === "production" && !local && parsed.protocol !== "https:") {
      return {
        status: "invalid",
        message: "Hosted Supabase must use HTTPS.",
      };
    }
    if (key.startsWith("sb_secret_")) throw new Error();
    // Legacy service-role JWTs must not enter public configuration either.
    if (key.split(".").length === 3) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") throw new Error();
    }
    return {
      status: "ready",
      message: "Supabase environment configured.",
      config: { url, key },
    };
  } catch {
    return {
      status: "invalid",
      message: "Check the Supabase URL and public key configuration.",
    };
  }
}
