import { getWorkspace } from "@/features/workspace/context";
import { CashboxForm } from "@/components/finance/cashbox-form";
export const metadata = { title: "Create cashbox" };
export default async function NewCashbox() {
  const workspace = await getWorkspace();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Create cashbox</h1>
      <p className="text-sm text-muted-foreground">
        Create an empty cashbox, then record an authorized opening balance if
        needed.
      </p>
      <CashboxForm workspace={workspace} />
    </div>
  );
}
