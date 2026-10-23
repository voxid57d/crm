import {
  CustomerDirectory,
  type DirectoryFilters,
} from "@/components/customers/directory";
export const metadata = { title: "Customers" };
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<DirectoryFilters>;
}) {
  return <CustomerDirectory filters={await searchParams} />;
}
