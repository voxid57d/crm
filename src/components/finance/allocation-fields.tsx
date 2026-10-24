"use client";
import { useState } from "react";
import { Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/finance/money.mjs";
import type { InvoiceChoice } from "@/features/finance/operations-types";
export function AllocationFields({
  invoices,
  selected,
}: {
  invoices: InvoiceChoice[];
  selected?: string;
}) {
  const [ids, setIds] = useState([0]);
  const [next, setNext] = useState(1);
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 font-medium">
        Initial invoice allocations (optional)
      </legend>
      <p className="text-xs text-muted-foreground">
        Leave blank to retain the payment as customer credit. You can allocate
        it later. The combined amount cannot exceed the payment or invoice
        balances.
      </p>
      {ids.map((key, index) => (
        <div
          key={key}
          className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-3"
        >
          <SelectField
            label="Invoice"
            name="allocation_invoice"
            defaultValue={index === 0 ? (selected ?? "") : ""}
          >
            <option value="">Keep as credit</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoice_number} · {formatMoney(i.outstanding)}
              </option>
            ))}
          </SelectField>
          <Field
            label="Allocate (UZS)"
            name="allocation_amount"
            inputMode="decimal"
            maxLength={19}
            defaultValue={
              index === 0
                ? (invoices.find((i) => i.id === selected)?.outstanding ?? "")
                : ""
            }
          />
          <Button
            type="button"
            variant="ghost"
            disabled={ids.length === 1}
            onClick={() => setIds(ids.filter((i) => i !== key))}
          >
            Remove allocation
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        type="button"
        disabled={ids.length >= 100 || invoices.length === 0}
        onClick={() => {
          setIds([...ids, next]);
          setNext(next + 1);
        }}
      >
        Add invoice allocation
      </Button>
    </fieldset>
  );
}
