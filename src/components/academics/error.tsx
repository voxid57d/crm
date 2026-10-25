"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
export default function AcademicError({ reset }: { reset: () => void }) {
  const current = usePathname();
  const path =
    [
      "/academics",
      "/classrooms",
      "/groups",
      "/enrollments",
      "/lessons",
      "/timetable",
    ].find((p) => current.startsWith(p)) ?? "/courses";
  return (
    <div role="alert" className="space-y-4 rounded-xl border bg-white p-6">
      <h1 className="text-xl font-semibold">
        Academic resources could not load
      </h1>
      <p className="text-sm text-muted-foreground">
        Check filters, current branch permissions and local Supabase services.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href={path + "?status=all&branch="}>Clear filters</Link>
        </Button>
      </div>
    </div>
  );
}
