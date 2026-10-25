import { AcademicNavigation } from "@/components/academics/navigation";
export default function CourseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <AcademicNavigation />
      {children}
    </div>
  );
}
