import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { resetPassword } from "@/features/auth/actions";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";

export const metadata = { title: "Choose a password" };

export default async function ResetPasswordPage() {
  await requireUser();
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mb-7 mt-3 text-sm text-muted-foreground">
        Use at least 12 characters.
      </p>
      <ActionForm action={resetPassword} submit="Update password">
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
        <Field
          label="Confirm password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </ActionForm>
      <Link
        href="/businesses"
        className="mt-7 block text-sm font-semibold text-primary"
      >
        Return to your businesses
      </Link>
    </>
  );
}
