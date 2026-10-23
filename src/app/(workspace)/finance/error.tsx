"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function FinanceError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 rounded-xl border bg-white p-6">
      <h1 className="text-xl font-semibold">
        Financial records could not load
      </h1>
      <p className="text-sm text-muted-foreground">
        Check your filters, current branch permissions and local Supabase
        services.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/finance/cashboxes?branch=">Clear cashbox filters</Link>
        </Button>
      </div>
    </div>
  );
}
