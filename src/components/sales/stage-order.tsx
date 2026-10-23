"use client";
import { useState } from "react";
import { reorderStages } from "@/features/sales/actions";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
export function StageOrder({
  tenantId,
  pipelineId,
  stages,
}: {
  tenantId: string;
  pipelineId: string;
  stages: { id: string; name: string }[];
}) {
  const [ordered, setOrdered] = useState(stages);
  function move(index: number, offset: number) {
    setOrdered((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  return (
    <ActionForm action={reorderStages} submit="Save stage order">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="pipeline_id" value={pipelineId} />
      <input
        type="hidden"
        name="stage_order"
        value={ordered.map((s) => s.id).join(",")}
      />
      <ol className="space-y-2">
        {ordered.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          >
            <span>
              {i + 1}. {s.name}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={i === 0}
                aria-label={`Move ${s.name} earlier`}
                onClick={() => move(i, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={i === ordered.length - 1}
                aria-label={`Move ${s.name} later`}
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </ActionForm>
  );
}
