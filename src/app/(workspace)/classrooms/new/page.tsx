import { getWorkspace } from "@/features/workspace/context";
import { ClassroomForm } from "@/components/academics/forms";
export const metadata = { title: "Add classroom" };
export default async function NewClassroom() {
  const w = await getWorkspace();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Add classroom</h1>
      <ClassroomForm workspace={w} />
    </div>
  );
}
