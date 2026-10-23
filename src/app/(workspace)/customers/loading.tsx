export default function LoadingCustomers() {
  return (
    <div role="status" className="space-y-5">
      <p className="text-sm text-muted-foreground">Loading customers…</p>
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
