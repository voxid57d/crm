"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FormAction } from "@/features/shared/action-state";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Please wait…" : label}
    </Button>
  );
}

export function ActionForm({
  action,
  submit,
  children,
  className = "space-y-4",
  confirmation,
}: {
  action: FormAction;
  submit: string;
  children?: React.ReactNode;
  className?: string;
  confirmation?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={
        confirmation
          ? (event) => {
              if (!window.confirm(confirmation)) event.preventDefault();
            }
          : undefined
      }
    >
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-red-50 p-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-lg border border-primary/20 bg-secondary p-3 text-sm text-primary"
        >
          {state.success}
        </p>
      )}
      {children}
      {state.link && (
        <div className="rounded-lg border p-3 text-sm">
          <p>
            Copy this invitation link and share it with the intended employee.
            It expires in 7 days.
          </p>
          <input
            aria-label="Invitation link"
            readOnly
            value={state.link}
            className="mt-2 w-full rounded border p-2 text-xs"
          />
          <a className="mt-2 block text-primary underline" href={state.link}>
            Open invitation
          </a>
        </div>
      )}
      <Submit label={submit} />
    </form>
  );
}
