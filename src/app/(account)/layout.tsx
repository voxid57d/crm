import { AppShell } from "@/components/layout/app-shell";
import { AccountMenu } from "@/components/layout/account-menu";
import { requireUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  return (
    <AppShell accountMenu={<AccountMenu email={user.email} />}>
      {children}
    </AppShell>
  );
}
