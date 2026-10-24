import { OperationProfile } from "@/components/finance/operation-profile";
export const metadata = { title: "Transfer history" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OperationProfile kind="transfer" id={(await params).id} />;
}
