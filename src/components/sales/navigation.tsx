import Link from "next/link";
export function SalesNavigation() {
  return (
    <nav
      aria-label="Sales navigation"
      className="flex flex-wrap gap-4 text-sm font-medium text-primary"
    >
      {[
        ["/sales", "Dashboard"],
        ["/leads", "Lead table"],
        ["/sales/board", "Kanban"],
        ["/sales/follow-ups", "Follow-ups"],
        ["/sales/reports", "Reports"],
        ["/sales/settings/pipelines", "Pipelines"],
        ["/sales/settings/sources", "Sources & loss reasons"],
      ].map(([href, title]) => (
        <Link key={href} href={href} className="underline underline-offset-4">
          {title}
        </Link>
      ))}
    </nav>
  );
}
