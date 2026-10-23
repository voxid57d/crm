import { notFound } from "next/navigation";
import { getCashbox, canCashbox } from "@/features/finance/queries";
import { CashboxForm } from "@/components/finance/cashbox-form";
export const metadata = { title: "Edit cashbox" };
export default async function EditCashbox({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspace, detail } = await getCashbox(id);
  if (!canCashbox(workspace, "cashboxes.manage", detail.cashbox.branch_id))
    notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Edit cashbox</h1>
      <p className="text-sm text-muted-foreground">
        {detail.cashbox.name} · {detail.branch_name ?? "Business-wide"}
      </p>
      <CashboxForm workspace={workspace} cashbox={detail.cashbox} />
    </div>
  );
}
