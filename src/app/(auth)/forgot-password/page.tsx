import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { requestPasswordReset } from "@/features/auth/actions";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        Forgot your password?
      </h1>
      <p className="mb-7 mt-3 text-sm leading-6 text-muted-foreground">
        We’ll send a reset link to the local development email inbox.
      </p>
      <ActionForm action={requestPasswordReset} submit="Send reset link">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </ActionForm>
      <Link
        href="/login"
        className="mt-7 block text-sm font-semibold text-primary"
      >
        Back to login
      </Link>
    </>
  );
}
