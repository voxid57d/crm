import { SalesAnalytics } from "@/components/sales/analytics";
import type { Search } from "@/features/sales/queries";
export const metadata = { title: "Sales dashboard" };
export default async function Sales({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return <SalesAnalytics search={await searchParams} />;
}
