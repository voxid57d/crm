import { notFound } from "next/navigation";
import { getWorkspace } from "@/features/workspace/context";
import { businessDate } from "@/features/academics/group-queries";
import { ClosureForm } from "@/components/academics/calendar-forms";
export const metadata = { title: "Add non-teaching date" };
export default async function Page() {
  const w = await getWorkspace();
  if (!w.permissions.has("schedules.manage_holidays")) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Add non-teaching date</h1>
      <ClosureForm workspace={w} today={businessDate(w)} />
    </div>
  );
}
