import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBusiness } from "@/features/workspace/actions";

export const metadata = { title: "Create business" };

export default function CreateBusinessPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          A NEW CHAPTER
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Create your business
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          You’ll become its Owner. A first branch will be created with your
          business.
        </p>
      </div>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createBusiness} submit="Create business">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Business name"
                name="name"
                required
                maxLength={150}
                autoComplete="organization"
              />
              <Field
                label="Business type"
                name="business_type"
                required
                maxLength={80}
                defaultValue="education"
              />
              <Field
                label="Contact email"
                name="contact_email"
                type="email"
                maxLength={254}
              />
              <Field
                label="Phone number"
                name="phone"
                type="tel"
                maxLength={40}
              />
              <Field
                label="Address"
                name="address"
                maxLength={500}
                className="sm:col-span-2"
              />
              <Field
                label="First branch name"
                name="branch_name"
                required
                maxLength={150}
                defaultValue="Main branch"
              />
            </div>
            <p className="rounded-lg bg-secondary p-4 text-sm text-primary">
              Default currency: UZS · Timezone: Asia/Tashkent. You can update
              these in business settings.
            </p>
          </ActionForm>
        </CardContent>
      </Card>
      <Link
        href="/businesses"
        className="inline-block text-sm font-medium text-primary"
      >
        Back to your businesses
      </Link>
    </div>
  );
}
