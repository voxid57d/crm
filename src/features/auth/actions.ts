"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  email,
  password,
  text,
  InputError,
  localAppOrigin,
} from "@/lib/validation.mjs";
import { requireUser } from "./session";
import type { ActionState } from "@/features/shared/action-state";

function failure(error: unknown): ActionState {
  return {
    error:
      error instanceof InputError
        ? error.message
        : "Local authentication is unavailable. Check Docker, Supabase, and your environment configuration.",
  };
}

export async function login(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const address = email(form);
    const secret = form.get("password");
    if (typeof secret !== "string" || !secret || secret.length > 128)
      throw new InputError("Enter your email and password.");
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: address,
      password: secret,
    });
    if (error)
      return {
        error:
          "Sign-in failed. Check your credentials and confirm your email if required.",
      };
    const store = await cookies();
    store.delete("forma-tenant");
    store.delete("forma-branch");
  } catch (error) {
    return failure(error);
  }
  redirect(
    (await cookies()).has("forma-invitation")
      ? "/invitations/accept"
      : "/businesses",
  );
}

export async function register(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  let hasSession = false;
  try {
    const address = email(form);
    const secret = password(form);
    const fullName = text(form, "full_name", {
      min: 1,
      max: 150,
      label: "Full name",
    });
    const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password: secret,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });
    if (error)
      return {
        error:
          "Registration could not complete. Check your details or try signing in if you already registered.",
      };
    hasSession = Boolean(data.session);
    if (!hasSession)
      return {
        success:
          "Check your local email inbox for a confirmation link, then sign in.",
      };
  } catch (error) {
    return failure(error);
  }
  redirect(
    (await cookies()).has("forma-invitation")
      ? "/invitations/accept"
      : "/businesses/new",
  );
}

export async function requestPasswordReset(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const address = email(form);
    const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    if (error)
      return {
        error:
          "The reset request could not complete. Check local services or wait before trying again.",
      };
    return {
      success:
        "If an account exists, a reset link will appear in the local email inbox. Open it in this browser.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function resetPassword(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();
  try {
    const secret = password(form);
    const { error } = await supabase.auth.updateUser({ password: secret });
    if (error)
      return {
        error:
          "The password could not be updated. Request a new reset link and try again.",
      };
    return {
      success:
        "Your password has been updated. You can return to your businesses.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function logout(): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return { error: "Sign-out failed. Please try again." };
  const store = await cookies();
  store.delete("forma-tenant");
  store.delete("forma-branch");
  redirect("/login");
}
