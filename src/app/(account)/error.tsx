"use client";

import { Button } from "@/components/ui/button";

export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border bg-white p-8">
      <h1 className="text-xl font-semibold">Businesses could not load</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Check local Supabase and apply the latest migrations.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
