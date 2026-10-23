"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Brand, Navigation } from "./navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function AppShell({
  children,
  workspaceBar,
  accountMenu,
}: {
  children: React.ReactNode;
  workspaceBar?: React.ReactNode;
  accountMenu?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const section =
    pathname === "/dashboard"
      ? "Overview"
      : pathname === "/settings"
        ? "Settings"
        : pathname === "/branches"
          ? "Branches"
          : pathname === "/team"
            ? "Team & access"
            : pathname.startsWith("/businesses")
              ? "Your businesses"
              : pathname.startsWith("/customers")
                ? "Customers"
                : pathname === "/students"
                  ? "Students"
                  : pathname.startsWith("/employees")
                    ? "Employees"
                    : pathname === "/roles"
                      ? "Roles & permissions"
                      : pathname.startsWith("/sales") ||
                          pathname.startsWith("/leads")
                        ? "Sales CRM"
                        : "Modules";
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-white p-3 focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto bg-[#172c28] p-5 lg:flex">
        <div className="px-2 pb-9 pt-3">
          <Brand />
        </div>
        <Navigation />
        <div className="mt-auto pt-8">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-white">A place to grow.</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              One workspace for every branch of your business.
            </p>
            <Link
              href="/settings"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#b9ecd3]"
            >
              Business settings <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-5 px-2 text-[11px] text-slate-400">
            Forma workspace · v0.1
          </p>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between gap-3 border-b bg-white px-5 md:px-9">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-72 overflow-y-auto border-0 bg-[#172c28] p-5 text-white"
              >
                <SheetTitle className="sr-only">
                  Workspace navigation
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Browse the workspace and planned modules.
                </SheetDescription>
                <div className="mb-9 flex items-center justify-between">
                  <Brand />
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close navigation"
                    >
                      <X />
                    </Button>
                  </SheetClose>
                </div>
                <Navigation onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="text-sm">
              <span className="hidden text-muted-foreground sm:inline">
                Workspace <span className="mx-2 text-slate-300">/</span>
              </span>
              <span className="font-medium">{section}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {accountMenu}
            <span className="hidden items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Development
            </span>
          </div>
        </header>
        {workspaceBar}
        <main
          id="main-content"
          className="mx-auto max-w-7xl px-5 py-8 md:px-9 md:py-10"
        >
          {children}
        </main>
        <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-5 pb-7 text-xs text-muted-foreground md:px-9">
          <span>Built for better learning businesses.</span>
          <span>Foundation · Local development</span>
        </footer>
      </div>
    </div>
  );
}
