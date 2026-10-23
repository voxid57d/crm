import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/features/auth/session";
import {
  acceptInvitation,
  dismissInvitation,
} from "@/features/employees/actions";
import { ActionForm } from "@/components/forms/action-form";
import { invitationPreview } from "@/features/employees/parsers";

export const metadata = { title: "Accept employee invitation" };
export default async function AcceptInvitationPage() {
  const { user, supabase } = await requireUser();
  const token = (await cookies()).get("forma-invitation")?.value;
  const result = token
    ? await supabase.rpc("preview_employee_invitation", { p_token: token })
    : null;
  const preview =
    result && !result.error ? invitationPreview(result.data) : null;
  return (
    <div className="mx-auto max-w-xl rounded-2xl border bg-white p-7">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        BUSINESS INVITATION
      </p>
      <h1 className="mt-4 text-2xl font-semibold">
        Join your employee workspace
      </h1>
      <p className="my-4 break-all text-sm text-muted-foreground">
        Signed in as {user.email}
      </p>
      {preview ? (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-4 text-sm">
            <dt>Business</dt>
            <dd>{preview.business}</dd>
            <dt>Employee profile</dt>
            <dd>{preview.employee}</dd>
            <dt>Assigned role</dt>
            <dd>{preview.role}</dd>
            <dt>Role scope</dt>
            <dd>
              {preview.scope === "business"
                ? "All business branches"
                : "Assigned branches"}
            </dd>
          </dl>
          <p className="mb-5 text-sm leading-6 text-muted-foreground">
            Accepting links this account to the existing employee record. No
            duplicate account or employee profile will be created.
          </p>
          <ActionForm action={acceptInvitation} submit="Accept invitation" />
        </>
      ) : (
        <p role="alert" className="rounded-lg bg-muted p-4 text-sm leading-6">
          This invitation is unavailable, expired, revoked, or intended for
          another email. Log out and use the matching confirmed account, or ask
          the Owner for a new link.
        </p>
      )}
      <div className="mt-5">
        <ActionForm action={dismissInvitation} submit="Dismiss this link" />
      </div>
      <Link
        href="/businesses"
        className="mt-6 inline-block text-sm text-primary underline"
      >
        Your businesses
      </Link>
    </div>
  );
}
