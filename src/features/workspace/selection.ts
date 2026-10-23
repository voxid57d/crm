import "server-only";
import { cookies } from "next/headers";
import { localAppOrigin } from "@/lib/validation.mjs";

export async function saveSelection(tenantId: string, branchId: string | null) {
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: localAppOrigin(process.env.NEXT_PUBLIC_APP_URL).startsWith(
      "https:",
    ),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  store.set("forma-tenant", tenantId, options);
  if (branchId) store.set("forma-branch", branchId, options);
  else store.delete("forma-branch");
}
