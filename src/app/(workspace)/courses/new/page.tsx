import { catalogOptions } from "@/features/academics/queries";
import { CourseForm } from "@/components/academics/forms";
export const metadata = { title: "Add course" };
export default async function NewCourse() {
  const options = await catalogOptions();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold">Add course</h1>
      <p className="text-sm text-muted-foreground">
        Configure a course once for your business. Branches will offer it
        through groups in the next increment.
      </p>
      <CourseForm workspace={options.workspace} options={options} />
    </div>
  );
}
