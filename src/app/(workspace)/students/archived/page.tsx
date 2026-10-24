import {
  CustomerDirectory,
  type DirectoryFilters,
} from "@/components/customers/directory";
export const metadata = { title: "Archived students" };
export default async function ArchivedStudents({
  searchParams,
}: {
  searchParams: Promise<DirectoryFilters>;
}) {
  return <CustomerDirectory filters={await searchParams} students archived />;
}
