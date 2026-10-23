export default function SalesLoading() {
  return (
    <div role="status" className="space-y-5">
      <p className="text-sm text-muted-foreground">Loading sales records…</p>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
