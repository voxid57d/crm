import { SalesAnalytics } from "@/components/sales/analytics";
import type { Search } from "@/features/sales/queries";
export const metadata = { title: "Sales reports" };
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return <SalesAnalytics search={await searchParams} report />;
}
