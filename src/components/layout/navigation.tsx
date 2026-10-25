"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare2,
  CircleDollarSign,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  Users,
  UserRoundPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "WORKSPACE",
    links: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/businesses", label: "Your businesses", icon: Building2 },
    ],
  },
  {
    label: "LEARNING",
    links: [
      { href: "/students", label: "Students", icon: GraduationCap },
      { href: "/courses", label: "Courses", icon: BookOpen },
      { href: "/groups", label: "Groups", icon: Users },
      { href: "/enrollments", label: "Enrollments", icon: GraduationCap },
      { href: "/classrooms", label: "Classrooms", icon: Building2 },
      { href: "/modules/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/modules/attendance", label: "Attendance", icon: CheckSquare2 },
    ],
  },
  {
    label: "SALES",
    links: [
      { href: "/sales", label: "Sales dashboard", icon: BarChart3 },
      { href: "/leads", label: "Leads", icon: UserRoundPlus },
      { href: "/sales/board", label: "Kanban pipeline", icon: LayoutDashboard },
      { href: "/sales/follow-ups", label: "Follow-ups", icon: CheckSquare2 },
      { href: "/sales/reports", label: "Sales reports", icon: BarChart3 },
    ],
  },
  {
    label: "FINANCE",
    links: [
      {
        href: "/finance",
        label: "Financial dashboard",
        icon: CircleDollarSign,
      },
      { href: "/finance/cashboxes", label: "Cashboxes", icon: Building2 },
      { href: "/finance/invoices", label: "Invoices", icon: CircleDollarSign },
      { href: "/finance/payments", label: "Payments", icon: CircleDollarSign },
      { href: "/finance/debts", label: "Receivables", icon: BarChart3 },
      { href: "/finance/expenses", label: "Expenses", icon: CircleDollarSign },
      {
        href: "/finance/transfers",
        label: "Cashbox transfers",
        icon: CircleDollarSign,
      },
      { href: "/finance/refunds", label: "Refunds", icon: CircleDollarSign },
      { href: "/finance/reports", label: "Financial reports", icon: BarChart3 },
    ],
  },
  {
    label: "BUSINESS",
    links: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/team", label: "Team & access", icon: Users },
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/roles", label: "Roles & permissions", icon: Settings2 },
      { href: "/branches", label: "Branches", icon: Building2 },
    ],
  },
];

export function Navigation({
  onNavigate,
  education = false,
}: {
  onNavigate?: () => void;
  education?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="space-y-7">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-400">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.links
              .filter((link) => !education || link.href !== "/customers")
              .map(({ href, label, icon: Icon }) => (
                <Link
                  onClick={onNavigate}
                  key={href}
                  href={href}
                  aria-current={
                    pathname === href ||
                    (!["/sales", "/finance"].includes(href) &&
                      pathname.startsWith(href + "/"))
                      ? "page"
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white",
                    (pathname === href ||
                      (!["/sales", "/finance"].includes(href) &&
                        pathname.startsWith(href + "/"))) &&
                      "bg-[#26493f] text-[#bcf2da] hover:bg-[#26493f]",
                  )}
                >
                  <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                  {label}
                </Link>
              ))}
          </div>
        </div>
      ))}
      <div className="border-t border-white/10 pt-4">
        <Link
          onClick={onNavigate}
          href="/settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5",
            pathname === "/settings" && "bg-[#26493f] text-[#bcf2da]",
          )}
        >
          <Settings2 size={17} aria-hidden="true" />
          Settings
        </Link>
      </div>
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 text-white">
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#b9ecd3] text-[#173d32]">
        <BarChart3 size={22} aria-hidden="true" />
      </span>
      <span className="text-2xl font-semibold tracking-tight">
        forma<span className="text-[#b9ecd3]">.</span>
      </span>
    </Link>
  );
}
