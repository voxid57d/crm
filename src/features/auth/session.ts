import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnvironment } from "@/lib/config/env";

export const getSessionUser = cache(async () => {
  if (!getSupabaseEnvironment().config) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return error ? null : user;
  } catch {
    // Authentication fails closed when local Auth cannot verify the session.
    return null;
  }
});

export const requireUser = cache(async () => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { user, supabase: await createClient() };
});
