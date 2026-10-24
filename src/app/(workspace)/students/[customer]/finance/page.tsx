import { ContactFinances } from "@/components/finance/contact-finances";
import type { FinanceSearch } from "@/features/finance/types";
export const metadata = { title: "Student finances" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ customer: string }>;
  searchParams: Promise<FinanceSearch>;
}) {
  return (
    <ContactFinances
      customerId={(await params).customer}
      search={await searchParams}
      studentFirst
    />
  );
}
