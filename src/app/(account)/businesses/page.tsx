import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { getBusinesses } from "@/features/workspace/context";
import { selectBusiness } from "@/features/workspace/actions";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Your businesses" };

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const businesses = await getBusinesses();
  const { notice } = await searchParams;
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            YOUR WORKSPACES
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Choose your business
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Only businesses with an active membership appear here.
          </p>
        </div>
        <Button asChild>
          <Link href="/businesses/new">
            <Plus className="size-4" />
            Create business
          </Link>
        </Button>
      </div>
      {notice === "branch-unavailable" && (
        <p role="status" className="rounded-xl border bg-secondary p-4 text-sm">
          Your previous branch is inactive or no longer authorized. Select a
          business to refresh your branch context.
        </p>
      )}
      {businesses.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <Building2 className="mx-auto size-10 text-primary" />
          <h2 className="mt-5 text-xl font-semibold">
            Your first business starts here
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Create a business, or ask an existing business Owner to add your
            registered email with an explicit role and branch assignment.
          </p>
          <Button asChild className="mt-6">
            <Link href="/businesses/new">Create a business</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {businesses.map((business) => (
            <Card key={business.id} className="shadow-none">
              <CardContent className="space-y-4 p-6">
                <Building2 className="size-7 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">{business.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {business.business_type} · {business.currency}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {business.timezone}
                  </p>
                </div>
                <ActionForm action={selectBusiness} submit="Open business">
                  <input type="hidden" name="tenant_id" value={business.id} />
                </ActionForm>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
