import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { login } from "@/features/auth/actions";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-7 mt-3 text-sm text-muted-foreground">
        Log in to your Forma workspace.
      </p>
      {notice === "invalid-link" && (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-destructive"
        >
          This link is invalid or expired. Request a fresh link in the same
          browser.
        </p>
      )}
      <ActionForm action={login} submit="Log in">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <Link
          href="/forgot-password"
          className="block text-sm text-primary underline underline-offset-4"
        >
          Forgot your password?
        </Link>
      </ActionForm>
      <p className="mt-7 text-sm text-muted-foreground">
        New to Forma?{" "}
        <Link href="/register" className="font-semibold text-primary">
          Create an account
        </Link>
      </p>
    </>
  );
}
