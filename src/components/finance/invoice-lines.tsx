"use client";
import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { InvoiceLine } from "@/features/finance/invoice-types";

export function InvoiceLines({ initial }: { initial?: InvoiceLine[] }) {
  const [lines, setLines] = useState(() =>
    (initial?.length
      ? initial
      : [
          {
            description: "",
            quantity: "1",
            unit_price: "",
            discount_amount: "0",
          },
        ]
    ).map((line, i) => ({ ...line, key: i })),
  );
  const [nextKey, setNextKey] = useState(lines.length);
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 font-semibold">Line items</legend>
      {lines.map((line, index) => (
        <div key={line.key} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Line {index + 1}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
            >
              Remove line {index + 1}
            </Button>
          </div>
          <Field
            label="Description"
            name="line_description"
            required
            maxLength={500}
            defaultValue={line.description}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Quantity"
              name="line_quantity"
              inputMode="decimal"
              required
              maxLength={11}
              defaultValue={line.quantity}
            />
            <Field
              label="Unit price (UZS)"
              name="line_price"
              inputMode="decimal"
              required
              maxLength={19}
              defaultValue={line.unit_price}
            />
            <Field
              label="Line discount (UZS)"
              name="line_discount"
              inputMode="decimal"
              required
              maxLength={19}
              defaultValue={line.discount_amount}
            />
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        type="button"
        disabled={lines.length >= 100}
        onClick={() => {
          setLines([
            ...lines,
            {
              key: nextKey,
              description: "",
              quantity: "1",
              unit_price: "",
              discount_amount: "0",
            },
          ]);
          setNextKey(nextKey + 1);
        }}
      >
        Add line
      </Button>
      <p className="text-xs text-muted-foreground">
        Up to 100 lines. Quantities allow 4 decimal places; amounts allow 2.
        Line discounts apply before the invoice discount. Save the draft to
        review totals before issuing.
      </p>
    </fieldset>
  );
}
