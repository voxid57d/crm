export default function Loading() {
  return (
    <div aria-live="polite" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Loading academic resources…
      </p>
      <div className="h-72 animate-pulse rounded-xl border bg-muted/40 motion-reduce:animate-none" />
    </div>
  );
}
