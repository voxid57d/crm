export default function LoadingFinance() {
  return (
    <div role="status" className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Loading financial records…
      </p>
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
