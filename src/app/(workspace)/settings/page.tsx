import Link from "next/link";
import { getWorkspace } from "@/features/workspace/context";
import {
  saveBusinessSettings,
  saveProfile,
} from "@/features/workspace/actions";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { tenant, user, supabase, permissions, roleName } =
    await getWorkspace();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error)
    throw new Error("Your profile could not load. Apply the local migrations.");
  const canEdit = permissions.has("tenant.update");
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {tenant.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your role: {roleName}. All changes are checked on the server and in
          the database.
        </p>
      </div>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Your profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveProfile} submit="Save profile">
            <Field
              label="Full name"
              name="full_name"
              required
              maxLength={150}
              defaultValue={profile.full_name}
            />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              maxLength={40}
              defaultValue={profile.phone}
            />
            <p className="text-sm text-muted-foreground">
              Account email: {user.email}
            </p>
          </ActionForm>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Business settings</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <ActionForm
              action={saveBusinessSettings}
              submit="Save business settings"
            >
              <input type="hidden" name="tenant_id" value={tenant.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Business name"
                  name="name"
                  required
                  maxLength={150}
                  defaultValue={tenant.name}
                />
                <Field
                  label="Business type"
                  name="business_type"
                  required
                  maxLength={80}
                  defaultValue={tenant.business_type}
                />
                <Field
                  label="Contact email"
                  name="contact_email"
                  type="email"
                  maxLength={254}
                  defaultValue={tenant.contact_email}
                />
                <Field
                  label="Phone number"
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={tenant.phone}
                />
                <Field
                  label="Address"
                  name="address"
                  maxLength={500}
                  defaultValue={tenant.address}
                  className="sm:col-span-2"
                />
                <Field
                  label="Currency code"
                  name="currency"
                  required
                  minLength={3}
                  maxLength={3}
                  defaultValue={tenant.currency}
                />
                <Field
                  label="Timezone"
                  name="timezone"
                  required
                  maxLength={100}
                  defaultValue={tenant.timezone}
                />
              </div>
            </ActionForm>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground">
                Business settings can be edited by the Owner or an Admin.
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <dt>Business</dt>
                <dd>{tenant.name}</dd>
                <dt>Type</dt>
                <dd>{tenant.business_type}</dd>
                <dt>Currency</dt>
                <dd>{tenant.currency}</dd>
                <dt>Timezone</dt>
                <dd>{tenant.timezone}</dd>
              </dl>
            </div>
          )}
          <div className="mt-6 space-y-2 border-t pt-4 text-xs text-muted-foreground">
            <p className="break-all">Business ID: {tenant.id}</p>
            <p className="break-all">Owner ID: {tenant.owner_id}</p>
            <p>
              Created:{" "}
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeZone: tenant.timezone,
              }).format(new Date(tenant.created_at))}
            </p>
          </div>
        </CardContent>
      </Card>
      <p className="text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-primary underline"
        >
          Reset your password
        </Link>
        <span className="mx-3 text-slate-300">·</span>
        <Link href="/setup" className="text-primary underline">
          Local setup guide
        </Link>
      </p>
    </div>
  );
}
