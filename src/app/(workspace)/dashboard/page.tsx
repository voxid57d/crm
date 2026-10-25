import Link from "next/link";
import { Building2, ShieldCheck, Sprout, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspace } from "@/features/workspace/context";

import { modules } from "@/features/modules/registry";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { tenant, branch, branches, roleName, permissions } =
    await getWorkspace();
  const stats = [
    {
      title: "Selected branch",
      value: branch?.name ?? "No branch selected",
      icon: Building2,
    },
    {
      title: "Accessible branches",
      value: String(branches.length),
      icon: Building2,
    },
    {
      title: "Your role",
      value: roleName,
      icon: ShieldCheck,
    },
  ];
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            YOUR WORKSPACE
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {tenant.name}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {branch
              ? "Working in " + branch.name
              : "Select an active authorized branch above to continue."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings">
            Business settings <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <section className="relative overflow-hidden rounded-2xl bg-[#e4efe9] p-7 md:p-8">
        <Badge variant="outline" className="border-[#bdd5c8] text-primary">
          {roleName}
        </Badge>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#224c3d]">
          Room for what comes next.
        </h2>
        <p className="relative z-10 mt-3 max-w-lg text-sm leading-6 text-[#486758]">
          Your business and branch access are connected. Build on this
          foundation, one workflow at a time.
        </p>
        <Sprout
          className="absolute bottom-7 right-10 hidden size-20 text-[#609077] sm:block"
          strokeWidth={1}
          aria-hidden="true"
        />
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ title, value, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{title}</p>
                <Icon className="size-4 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-4 break-words text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Business at a glance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Business type</dt>
              <dd>{tenant.business_type}</dd>
              <dt className="text-muted-foreground">Currency</dt>
              <dd>{tenant.currency}</dd>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd>{tenant.timezone}</dd>
              <dt className="text-muted-foreground">Contact email</dt>
              <dd className="break-all">
                {tenant.contact_email || "Not provided"}
              </dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{tenant.phone || "Not provided"}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Workspace essentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link
              href="/branches"
              className="block text-sm font-medium text-primary"
            >
              {permissions.has("branches.create")
                ? "Create and manage branches"
                : "View your authorized branches"}{" "}
              →
            </Link>
            <Link
              href="/businesses"
              className="block text-sm font-medium text-primary"
            >
              Switch or create a business →
            </Link>
            {permissions.has("members.read") && (
              <Link
                href="/team"
                className="block text-sm font-medium text-primary"
              >
                Team roles and branch access →
              </Link>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              Your workspace shows only records within your current membership
              and branch assignments.
            </p>
          </CardContent>
        </Card>
      </div>
      <section>
        <h2 className="text-lg font-semibold">
          Build your workspace, step by step
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Student profiles, the course catalog and classrooms are available.
          Groups, schedules and attendance workflows will follow.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {modules.slice(0, 4).map((entry) => (
            <Link
              key={entry.slug}
              href={
                entry.slug === "students"
                  ? "/students"
                  : entry.slug === "courses"
                    ? "/courses"
                    : "/modules/" + entry.slug
              }
              className="rounded-xl border bg-white p-5 hover:border-primary/40"
            >
              <h3 className="text-sm font-semibold">{entry.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {entry.description}
              </p>
              <span className="mt-4 block text-xs text-muted-foreground">
                {entry.slug === "students"
                  ? "Open students"
                  : entry.slug === "courses"
                    ? "Open courses"
                    : "Planned module"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
