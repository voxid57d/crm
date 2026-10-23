import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const inputStyle =
  "mt-1.5 block min-h-10 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:bg-muted";

export function Field({
  label,
  name,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <label className={cn("block text-sm font-medium", className)}>
      {label}
      <input name={name} className={inputStyle} {...props} />
    </label>
  );
}

export function SelectField({
  label,
  name,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select name={name} className={inputStyle} {...props}>
        {children}
      </select>
    </label>
  );
}
