import type { SalaryConfig, InvitationPreview } from "./types";

export function salaryConfig(value: unknown): SalaryConfig | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid salary response schema.");
  const record = value as Record<string, unknown>;
  for (const key of ["salary_type", "bonus_basis", "currency", "updated_at"])
    if (typeof record[key] !== "string")
      throw new Error("Invalid salary response schema.");
  for (const key of [
    "amount",
    "percentage",
    "bonus_amount",
    "bonus_percentage",
  ])
    if (record[key] !== null && typeof record[key] !== "string")
      throw new Error("Salary amounts must use exact decimal strings.");
  return record as SalaryConfig;
}
export function invitationPreview(value: unknown): InvitationPreview | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid invitation response.");
  const record = value as Record<string, unknown>;
  for (const key of ["business", "employee", "role", "scope", "expires_at"])
    if (typeof record[key] !== "string")
      throw new Error("Invalid invitation response.");
  return record as InvitationPreview;
}
