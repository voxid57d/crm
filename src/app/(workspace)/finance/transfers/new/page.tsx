import { NewOperation } from "@/components/finance/new-operation";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Transfer funds" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<FinanceSearch>;
}) {
  return <NewOperation kind="transfer" search={await searchParams} />;
}
