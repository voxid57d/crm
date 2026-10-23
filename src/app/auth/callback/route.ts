import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localAppOrigin, safeNext } from "@/lib/validation.mjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const code = request.nextUrl.searchParams.get("code");
  const destination = request.nextUrl.searchParams.has("next")
    ? safeNext(request.nextUrl.searchParams.get("next"))
    : (await cookies()).has("forma-invitation")
      ? "/invitations/accept"
      : "/businesses";
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL(destination, origin));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    } catch {
      /* Return a generic error without exposing tokens or codes. */
    }
  }
  return NextResponse.redirect(new URL("/login?notice=invalid-link", origin));
}
