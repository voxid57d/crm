import { saveGuardian, unlinkGuardian } from "@/features/customers/actions";
import { CustomerIdentity } from "./fields";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import type { Guardian } from "@/features/customers/types";

type Link = {
  guardian_id: string;
  relationship: string;
  is_emergency: boolean;
};
function GuardianFields({
  guardian,
  relationship = "",
  emergency = false,
}: {
  guardian?: Guardian;
  relationship?: string;
  emergency?: boolean;
}) {
  return (
    <>
      <Field
        label="Full name"
        name="full_name"
        required
        maxLength={150}
        defaultValue={guardian?.full_name}
      />
      <Field
        label="Phone number"
        name="phone"
        required
        minLength={3}
        maxLength={40}
        type="tel"
        defaultValue={guardian?.phone}
      />
      <Field
        label="Email (optional)"
        name="email"
        type="email"
        maxLength={254}
        defaultValue={guardian?.email ?? ""}
      />
      <Field
        label="Relationship to student"
        name="relationship"
        required
        maxLength={80}
        defaultValue={relationship}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_emergency"
          defaultChecked={emergency}
          className="size-4 accent-primary"
        />
        Emergency contact
      </label>
    </>
  );
}
export function Guardians({
  tenantId,
  customerId,
  links,
  contacts,
  choices,
  canEdit,
  search,
}: {
  tenantId: string;
  customerId: string;
  links: Link[];
  contacts: Guardian[];
  choices: Guardian[];
  canEdit: boolean;
  search: string;
}) {
  return (
    <section
      id="guardians"
      className="space-y-4 rounded-xl border bg-white p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold">Parents & guardians</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        One guardian contact can be shared by siblings. Updating shared contact
        details requires update access to every linked student.
      </p>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {links.map((link) => {
          const guardian = contacts.find((g) => g.id === link.guardian_id);
          if (!guardian) return null;
          return (
            <div key={guardian.id} className="space-y-3 rounded-lg border p-4">
              <p className="font-medium">{guardian.full_name}</p>
              <p className="text-sm">
                {guardian.phone}
                {guardian.email ? ` · ${guardian.email}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {link.relationship}
                {link.is_emergency ? " · Emergency contact" : ""}
              </p>
              {canEdit && (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">
                      Edit contact / relationship
                    </summary>
                    <div className="mt-4">
                      <ActionForm action={saveGuardian} submit="Save guardian">
                        <CustomerIdentity
                          tenantId={tenantId}
                          customerId={customerId}
                        />
                        <input
                          type="hidden"
                          name="guardian_id"
                          value={guardian.id}
                        />
                        <GuardianFields
                          guardian={guardian}
                          relationship={link.relationship}
                          emergency={link.is_emergency}
                        />
                      </ActionForm>
                    </div>
                  </details>
                  <ActionForm
                    action={unlinkGuardian}
                    submit="Unlink from this student"
                  >
                    <CustomerIdentity
                      tenantId={tenantId}
                      customerId={customerId}
                    />
                    <input
                      type="hidden"
                      name="guardian_id"
                      value={guardian.id}
                    />
                    <p className="text-xs text-muted-foreground">
                      Unlinking preserves the contact and activity history.
                    </p>
                  </ActionForm>
                </>
              )}
            </div>
          );
        })}
      </div>
      {!links.length && (
        <p className="text-sm text-muted-foreground">No guardians recorded.</p>
      )}
      {canEdit && (
        <div className="grid items-start gap-5 md:grid-cols-2">
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Add guardian contact
            </summary>
            <div className="mt-4">
              <ActionForm action={saveGuardian} submit="Add guardian">
                <CustomerIdentity tenantId={tenantId} customerId={customerId} />
                <GuardianFields />
              </ActionForm>
            </div>
          </details>
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium">Reuse an existing guardian</h3>
            <form className="my-4 space-y-3">
              <Field
                label="Search guardian name"
                name="guardian_search"
                defaultValue={search}
                maxLength={100}
              />
              <button className="text-sm font-medium text-primary underline">
                Search existing contacts
              </button>
            </form>
            {choices.length ? (
              <ActionForm action={saveGuardian} submit="Link existing guardian">
                <CustomerIdentity tenantId={tenantId} customerId={customerId} />
                <SelectField
                  label="Guardian (up to 50 matches)"
                  name="guardian_id"
                  required
                >
                  <option value="">Choose a contact</option>
                  {choices.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name} · {g.phone}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Relationship"
                  name="relationship"
                  required
                  maxLength={80}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="is_emergency"
                    className="size-4 accent-primary"
                  />
                  Emergency contact
                </label>
                <p className="text-xs text-muted-foreground">
                  Existing contact details are preserved.
                </p>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">
                No authorized matching contacts. Search another name or add a
                contact.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
