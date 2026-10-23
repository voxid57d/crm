import {
  CustomerDirectory,
  type DirectoryFilters,
} from "@/components/customers/directory";
export const metadata = { title: "Archived customers" };
export default async function Archived({
  searchParams,
}: {
  searchParams: Promise<DirectoryFilters>;
}) {
  return <CustomerDirectory filters={await searchParams} archived />;
}
