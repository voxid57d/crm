import { OperationDirectory } from "@/components/finance/operation-directory";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Cashbox transfers" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  return <OperationDirectory kind="transfer" search={await searchParams} />;
}
