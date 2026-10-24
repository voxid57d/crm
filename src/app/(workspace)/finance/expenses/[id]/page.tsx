import { OperationProfile } from "@/components/finance/operation-profile";
export const metadata = { title: "Expense history" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OperationProfile kind="expense" id={(await params).id} />;
}
