import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { ArrowLeft, Blocks } from "lucide-react";
import { modules } from "@/features/modules/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamicParams = false;

export function generateStaticParams() {
  return modules.map((entry) => ({ module: entry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = await params;
  return {
    title:
      modules.find((item) => item.slug === slug)?.title ?? "Module not found",
  };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = await params;
  await requireUser();
  if (slug === "branches") redirect("/branches");
  if (slug === "team") redirect("/team");
  if (slug === "students") redirect("/students");
  if (slug === "courses") redirect("/courses");
  if (slug === "schedule") redirect("/timetable");
  if (slug === "leads") redirect("/leads");
  if (slug === "finance") redirect("/finance");
  const entry = modules.find((item) => item.slug === slug);
  if (!entry) notFound();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        {entry.category}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {entry.title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{entry.description}</p>
      <div className="mt-8 flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed bg-white px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Blocks size={27} aria-hidden="true" />
        </span>
        <Badge variant="secondary" className="mt-5">
          Planned module
        </Badge>
        <h2 className="mt-4 text-xl font-semibold">
          A space for {entry.title.toLowerCase()}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          This module has not been implemented yet. Its records and workflows
          will be added in a later development phase.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/dashboard">
            <ArrowLeft className="size-4" />
            Back to overview
          </Link>
        </Button>
      </div>
    </div>
  );
}
