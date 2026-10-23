import Link from "next/link";
import { Brand } from "@/components/layout/navigation";
import { getSupabaseEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const env = getSupabaseEnvironment();
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-[#172c28] p-12 text-white lg:flex">
        <Brand />
        <div>
          <p className="text-sm font-medium text-[#b9ecd3]">
            YOUR NEXT CHAPTER
          </p>
          <h1 className="mt-5 max-w-lg text-5xl font-semibold leading-tight tracking-tight">
            A connected home for your business.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-300">
            Your team, your branches, and room to grow. All in one workspace.
          </p>
        </div>
        <p className="text-xs text-slate-400">Forma · Local development</p>
      </aside>
      <div className="flex items-center justify-center p-5 py-12">
        <div className="w-full max-w-md">
          <Link
            href="/login"
            className="mb-8 block text-2xl font-semibold text-primary lg:hidden"
          >
            forma.
          </Link>
          {!env.config && (
            <div
              role="status"
              className="mb-6 rounded-xl border bg-secondary p-4 text-sm leading-6"
            >
              {env.message}{" "}
              <Link
                href="/setup"
                className="font-semibold text-primary underline"
              >
                Open local setup
              </Link>
            </div>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}
