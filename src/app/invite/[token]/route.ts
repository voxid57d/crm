import { NextResponse, type NextRequest } from "next/server";
import { localAppOrigin } from "@/lib/validation.mjs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = localAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const response = NextResponse.redirect(
    new URL(
      /^[0-9a-f]{64}$/.test(token)
        ? "/invitations/accept"
        : "/login?notice=invalid-link",
      origin,
    ),
  );
  if (/^[0-9a-f]{64}$/.test(token))
    response.cookies.set("forma-invitation", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https:"),
      path: "/",
      maxAge: 3600,
    });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
