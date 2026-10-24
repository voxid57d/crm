import { AppShell } from "@/components/layout/app-shell";
import { getWorkspace } from "@/features/workspace/context";
import { AccountMenu } from "@/components/layout/account-menu";
import { WorkspaceControls } from "@/components/layout/workspace-controls";
import { isEducationBusiness } from "@/features/workspace/business.mjs";

// Session-dependent content must never be statically cached across users.
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getWorkspace();
  return (
    <AppShell
      education={isEducationBusiness(workspace.tenant.business_type)}
      accountMenu={<AccountMenu email={workspace.user.email} />}
      workspaceBar={<WorkspaceControls {...workspace} />}
    >
      {children}
    </AppShell>
  );
}
