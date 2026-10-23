import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <p className="text-sm text-primary">404</p>
      <h1 className="mt-3 text-3xl font-semibold">Page not found</h1>
      <p className="my-5 text-muted-foreground">
        This page is not part of your workspace.
      </p>
      <Link
        href="/dashboard"
        className="font-medium text-primary underline underline-offset-4"
      >
        Back to overview
      </Link>
    </main>
  );
}
