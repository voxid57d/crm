import { LeadDirectory } from "@/components/sales/directory";
import type { Search } from "@/features/sales/queries";
export const metadata = { title: "Leads" };
export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return <LeadDirectory search={await searchParams} />;
}
