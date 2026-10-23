import { inspectEnvironment } from "./environment.mjs";

export function getSupabaseEnvironment() {
  return inspectEnvironment({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function requireSupabaseEnvironment() {
  const state = getSupabaseEnvironment();
  if (!state.config) throw new Error(state.message);
  return state.config;
}
