"use client";
import { useActionState } from "react";
import Link from "next/link";
import { findDuplicates } from "@/features/customers/actions";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";

export function DuplicateChecker({
  tenantId,
  customerId,
  phone = "",
  email = "",
  name = "",
  studentFirst = false,
  enrollmentGroup,
}: {
  tenantId: string;
  customerId?: string;
  phone?: string;
  email?: string;
  name?: string;
  studentFirst?: boolean;
  enrollmentGroup?: string;
}) {
  const [state, action, pending] = useActionState(findDuplicates, {});
  return (
    <details className="rounded-xl border bg-white p-5">
      <summary className="cursor-pointer text-sm font-medium">
        Check for possible duplicates
      </summary>
      <p className="mb-4 mt-3 text-xs text-muted-foreground">
        Checks matching phone, email, or full name among contacts you can view,
        including archived contacts. Shared numbers are allowed; nothing is
        merged.
      </p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />
        {customerId && (
          <input type="hidden" name="customer_id" value={customerId} />
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Phone"
            name="phone"
            defaultValue={phone}
            maxLength={40}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={email}
            maxLength={254}
          />
          <Field
            label="Full name"
            name="name"
            defaultValue={name}
            maxLength={200}
          />
        </div>
        <Button disabled={pending} variant="outline">
          {pending ? "Checking…" : "Check matches"}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.matches && (
          <div role="status" className="space-y-2 text-sm">
            {state.matches.length === 0
              ? "No possible matches found in your authorized scope."
              : state.matches.map((m) => (
                  <p key={m.id}>
                    <Link
                      href={
                        studentFirst && !m.archived
                          ? `/students/new?existing=${m.id}${enrollmentGroup ? `&enroll_group=${encodeURIComponent(enrollmentGroup)}` : ""}`
                          : `/customers/${m.id}`
                      }
                      className="font-medium text-primary underline"
                    >
                      {m.full_name}
                      {studentFirst && !m.archived
                        ? " — Use this contact / student"
                        : ""}
                    </Link>{" "}
                    · {m.phone} · {m.match_reason}
                    {m.archived ? " · Archived" : ""}
                  </p>
                ))}
          </div>
        )}
      </form>
    </details>
  );
}
