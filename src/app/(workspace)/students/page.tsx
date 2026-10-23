import {
  CustomerDirectory,
  type DirectoryFilters,
} from "@/components/customers/directory";
export const metadata = { title: "Students" };
export default async function Students({
  searchParams,
}: {
  searchParams: Promise<DirectoryFilters>;
}) {
  return <CustomerDirectory filters={await searchParams} students />;
}
