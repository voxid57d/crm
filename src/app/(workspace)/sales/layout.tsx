import { SalesNavigation } from "@/components/sales/navigation";
export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <SalesNavigation />
      {children}
    </div>
  );
}
