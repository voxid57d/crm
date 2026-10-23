"use client";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { useState, useTransition } from "react";
import Link from "next/link";
import { changeStage } from "@/features/sales/actions";
import type { LeadCard, Stage } from "@/features/sales/types";
import { Button } from "@/components/ui/button";

export function Kanban({
  tenantId,
  initialCards,
  stages,
  counts,
  canMove,
  timezone,
  reasons,
  now,
}: {
  tenantId: string;
  initialCards: LeadCard[];
  stages: Stage[];
  counts: Record<string, number>;
  canMove: string[];
  timezone: string;
  reasons: { id: string; name: string; is_active: boolean }[];
  now: string;
}) {
  const [cards, setCards] = useState(initialCards),
    [columnCounts, setCounts] = useState(counts),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const [loss, setLoss] = useState<{ lead: LeadCard; stage: Stage } | null>(
    null,
  );
  function move(lead: LeadCard, stageId: string, reason = "", notes = "") {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || lead.stage_id === stage.id || pending) return;
    if (stage.outcome === "won") {
      setMessage(
        "Open the lead profile and use Convert to review customer matches.",
      );
      return;
    }
    if (
      !stage.is_active ||
      !canMove.includes(lead.branch_id) ||
      lead.status === "converted" ||
      lead.archived
    ) {
      setMessage("This move is not available for your role or this lead.");
      return;
    }
    if (["lost", "disqualified"].includes(stage.outcome) && !reason) {
      setLoss({ lead, stage });
      return;
    }
    const previousCards = cards,
      previousCounts = columnCounts;
    start(async () => {
      setMessage("Saving stage…");
      setCards((current) =>
        current.map((c) =>
          c.id === lead.id
            ? { ...c, stage_id: stage.id, status: stage.outcome }
            : c,
        ),
      );
      setCounts((current) => ({
        ...current,
        [lead.stage_id]: Math.max(0, (current[lead.stage_id] ?? 0) - 1),
        [stage.id]: (current[stage.id] ?? 0) + 1,
      }));
      const form = new FormData();
      form.set("tenant_id", tenantId);
      form.set("lead_id", lead.id);
      form.set("stage_id", stage.id);
      form.set("expected_stage", lead.stage_id);
      form.set("reason_id", reason);
      form.set("loss_notes", notes);
      try {
        const result = await changeStage({}, form);
        if (result.error) {
          setCards(previousCards);
          setCounts(previousCounts);
          setMessage(result.error + " Previous position restored.");
        } else setMessage("Stage saved.");
      } catch {
        setCards(previousCards);
        setCounts(previousCounts);
        setMessage("Could not save. Previous position restored.");
      }
    });
  }
  const date = (v: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(v));
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-sm text-primary"
      >
        {message ||
          "Drag a card to move it, or use its Move control. Converted stages require the customer conversion workflow."}
      </p>
      <div
        className="flex items-start gap-4 overflow-x-auto pb-5"
        aria-label="Sales Kanban board"
      >
        {stages
          .filter((s) => s.is_active || (columnCounts[s.id] ?? 0) > 0)
          .map((stage) => (
            <section
              key={stage.id}
              aria-label={stage.name}
              className="w-72 shrink-0 rounded-xl border bg-muted/50"
              onDragOver={(e) => {
                if (!pending) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const lead = cards.find(
                  (c) => c.id === e.dataTransfer.getData("text/plain"),
                );
                if (lead) move(lead, stage.id);
              }}
            >
              <div
                className="flex items-center justify-between border-b border-t-4 p-4"
                style={{ borderTopColor: stage.color }}
              >
                <h2 className="text-sm font-semibold">
                  {stage.name}
                  {!stage.is_active ? " (inactive)" : ""}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {columnCounts[stage.id] ?? 0}
                </span>
              </div>
              <div className="space-y-3 p-3">
                {cards
                  .filter((c) => c.stage_id === stage.id)
                  .map((lead) => (
                    <article
                      key={lead.id}
                      draggable={
                        !pending &&
                        canMove.includes(lead.branch_id) &&
                        lead.status !== "converted" &&
                        !lead.archived
                      }
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", lead.id)
                      }
                      className="space-y-2 rounded-lg border bg-white p-4 shadow-sm"
                    >
                      <Link
                        href={`/leads/${lead.id}`}
                        className="block font-medium text-primary hover:underline"
                      >
                        {lead.first_name} {lead.last_name}
                      </Link>
                      <p className="text-xs">{lead.phone}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.priority} priority ·{" "}
                        {lead.employee_name ?? "Unassigned"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lead.next_follow_up
                          ? `${Date.parse(lead.next_follow_up) < Date.parse(now) ? "Overdue follow-up" : "Follow-up"}: ${date(lead.next_follow_up)}`
                          : "No pending follow-up"}
                      </p>
                      {canMove.includes(lead.branch_id) &&
                        lead.status !== "converted" &&
                        !lead.archived && (
                          <form
                            className="flex gap-2 pt-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const data = new FormData(e.currentTarget);
                              move(lead, String(data.get("stage")));
                            }}
                          >
                            <select
                              name="stage"
                              aria-label={`Move ${lead.first_name} to stage`}
                              defaultValue={lead.stage_id}
                              className="min-w-0 flex-1 rounded border p-1 text-xs"
                              disabled={pending}
                            >
                              {stages
                                .filter(
                                  (s) => s.is_active || s.id === lead.stage_id,
                                )
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                            >
                              Move
                            </Button>
                          </form>
                        )}
                    </article>
                  ))}
                {!cards.some((c) => c.stage_id === stage.id) && (
                  <p className="py-7 text-center text-xs text-muted-foreground">
                    No matching leads
                  </p>
                )}
                {(columnCounts[stage.id] ?? 0) > 20 && (
                  <p className="text-xs text-muted-foreground">
                    Showing up to 20 most recently updated.{" "}
                    <Link
                      className="text-primary underline"
                      href={`/leads?pipeline=${stage.pipeline_id}&stage=${stage.id}`}
                    >
                      View stage in table
                    </Link>
                  </p>
                )}
              </div>
            </section>
          ))}
      </div>
      <Sheet
        open={Boolean(loss)}
        onOpenChange={(open) => {
          if (!open) setLoss(null);
        }}
      >
        <SheetContent className="space-y-4 overflow-y-auto p-6">
          {loss && (
            <>
              <SheetTitle>
                Mark {loss.lead.first_name} as {loss.stage.name}
              </SheetTitle>
              <SheetDescription>
                The lead and its history will be retained.
              </SheetDescription>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const chosen = loss;
                  setLoss(null);
                  move(
                    chosen.lead,
                    chosen.stage.id,
                    String(data.get("reason")),
                    String(data.get("notes") ?? ""),
                  );
                }}
              >
                <label className="block text-sm">
                  Loss reason
                  <select
                    name="reason"
                    required
                    autoFocus
                    className="mt-2 block w-full rounded border p-2"
                  >
                    <option value="">Choose a reason</option>
                    {reasons
                      .filter((r) => r.is_active)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Notes (optional)
                  <textarea
                    name="notes"
                    maxLength={2000}
                    className="mt-2 w-full rounded border p-2"
                  />
                </label>
                <div className="flex gap-3">
                  <Button>Confirm outcome</Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setLoss(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
