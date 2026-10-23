import Link from "next/link";
import { getSupabaseEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local setup" };

export default function SetupPage() {
  const env = getSupabaseEnvironment();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-semibold text-primary">
        FORMA · LOCAL DEVELOPMENT
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Connect local Supabase</h1>
      <p role="status" className="my-6 rounded-xl border bg-white p-4 text-sm">
        {env.message} Configuration status does not confirm service health.
      </p>
      <ol className="list-decimal space-y-4 pl-5 text-sm leading-6">
        <li>Install Docker Desktop with Linux containers and start it.</li>
        <li>
          Run <code>npm run db:start</code> in the project folder.
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> only if it
          does not exist. Use <code>npm run db:status</code> to copy the local
          public key.
        </li>
        <li>
          Run <code>npm run db:migrate</code>, <code>npm run db:lint</code>,{" "}
          <code>npm run db:test</code>, and <code>npm run db:types</code>.
        </li>
        <li>
          Restart <code>npm run dev</code> and open{" "}
          <code>http://127.0.0.1:3000</code>.
        </li>
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">
        No service-role key is needed. Use the same browser and hostname for
        password reset links. Local email is captured at port 54324.
      </p>
      <Link
        href="/login"
        className="mt-7 inline-block font-medium text-primary underline"
      >
        Continue to login
      </Link>
    </main>
  );
}
