import Link from "next/link";
import { Button } from "@/components/ui/button";
export function FinancePagination({
  path,
  filters,
  page,
  total,
  pageKey = "page",
  anchor = "",
}: {
  path: string;
  filters: Record<string, string>;
  page: number;
  total: number;
  pageKey?: string;
  anchor?: string;
}) {
  const href = (next: number) => {
    const params = new URLSearchParams(filters);
    params.set(pageKey, String(next));
    return `${path}?${params}${anchor}`;
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>
        {total} records · Page {page + 1} of{" "}
        {Math.max(1, Math.ceil(total / 20))}
      </p>
      <div className="flex gap-2">
        {page > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>Previous</Link>
          </Button>
        )}
        {(page + 1) * 20 < total && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
