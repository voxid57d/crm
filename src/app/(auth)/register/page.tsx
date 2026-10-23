import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { register } from "@/features/auth/actions";

export const metadata = { title: "Create account" };

export default function RegistrationPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mb-7 mt-3 text-sm text-muted-foreground">
        Start with your account. Create or join a business next.
      </p>
      <ActionForm action={register} submit="Create account">
        <Field
          label="Full name"
          name="full_name"
          autoComplete="name"
          required
          maxLength={150}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
        <Field
          label="Password · at least 12 characters"
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
      <p className="mt-7 text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-primary">
          Log in
        </Link>
      </p>
    </>
  );
}
