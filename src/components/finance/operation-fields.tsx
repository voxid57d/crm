import { randomUUID } from "node:crypto";
export function OperationIdentity({
  tenantId,
  fields = {},
}: {
  tenantId: string;
  fields?: Record<string, string | number>;
}) {
  return (
    <>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="request_id" value={randomUUID()} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
export function FinancialConfirmation() {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1" type="checkbox" name="confirm_finance" required />
      <span>
        I have reviewed the amount, records and date. I confirm this financial
        operation will be retained in history.
      </span>
    </label>
  );
}
