"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnvironment } from "@/lib/config/env";
import type { Database } from "./schema";

export function createClient() {
  const { url, key } = requireSupabaseEnvironment();
  return createBrowserClient<Database>(url, key);
}
