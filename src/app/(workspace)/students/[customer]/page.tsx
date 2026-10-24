import {
  ContactProfile,
  type ProfileSearch,
} from "@/components/customers/profile";
export const metadata = { title: "Student profile" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ customer: string }>;
  searchParams: Promise<ProfileSearch>;
}) {
  return (
    <ContactProfile
      id={(await params).customer}
      filters={await searchParams}
      studentFirst
    />
  );
}
