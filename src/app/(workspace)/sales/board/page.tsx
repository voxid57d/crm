import { LeadDirectory } from "@/components/sales/directory";
import type { Search } from "@/features/sales/queries";
export const metadata = { title: "Sales Kanban" };
export default async function Board({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return <LeadDirectory search={await searchParams} board />;
}
