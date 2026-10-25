"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AttendanceRow,
  AttendanceStatus,
} from "@/features/academics/attendance-types";
import { attendanceStatuses } from "@/features/academics/attendance-types";
import {
  saveAttendance,
  correctAttendance,
  finalizeAttendance,
  refreshAttendanceRoster,
} from "@/features/academics/attendance-actions";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
type Identity = {
  tenant_id: string;
  lesson_id: string;
  version: string;
  page: string;
};
function Hidden({
  identity,
  request,
}: {
  identity: Identity;
  request: string;
}) {
  return (
    <>
      {Object.entries({ ...identity, request_id: request }).map(
        ([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ),
      )}
    </>
  );
}
export function AttendanceEditor({
  rows: initial,
  identity,
  saveRequest,
  finalizeRequest,
  reviewRequest,
  canManage,
  canCorrect,
  canFinalize,
  rosterChanged,
  unmarked,
  expected,
}: {
  rows: AttendanceRow[];
  identity: Identity;
  saveRequest: string;
  finalizeRequest: string;
  reviewRequest: string;
  canManage: boolean;
  canCorrect: boolean;
  canFinalize: boolean;
  rosterChanged: boolean;
  unmarked: number;
  expected: number;
}) {
  const [rows, setRows] = useState(initial),
    dirty = JSON.stringify(rows) !== JSON.stringify(initial),
    editable = canManage || canCorrect;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = (
    index: number,
    key: "status" | "notes" | "late_minutes",
    value: string,
  ) =>
    setRows((old) =>
      old.map((r, i) =>
        i !== index
          ? r
          : key === "status"
            ? {
                ...r,
                status: value as AttendanceStatus,
                late_minutes: value === "late" ? r.late_minutes : null,
              }
            : key === "late_minutes"
              ? { ...r, late_minutes: value ? Number(value) : null }
              : { ...r, notes: value },
      ),
    );
  const markPage = (status: AttendanceStatus) => {
    if (
      !window.confirm(
        `Mark the expected students on this page ${status}? Review exceptions before saving.`,
      )
    )
      return;
    setRows((old) =>
      old.map((r) =>
        r.is_expected ? { ...r, status, late_minutes: null } : r,
      ),
    );
  };
  const table = (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Attendance roster and marks</caption>
        <thead className="bg-muted/50">
          <tr>
            {["Student", "Attendance", "Late minutes", "Optional note"].map(
              (h) => (
                <th key={h} scope="col" className="p-4 font-medium">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? r.customer_id} className="border-t">
              <td className="min-w-48 p-4">
                <p className="font-medium">{r.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.student_identifier}
                </p>
                {r.can_open_student && (
                  <Link
                    className="mt-2 block text-xs text-primary underline"
                    href={`/students/${r.customer_id}`}
                  >
                    Student profile
                  </Link>
                )}
                {!r.is_expected && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Excluded after roster review; retained history.
                  </p>
                )}
              </td>
              <td className="min-w-36 p-4">
                {editable && r.is_expected ? (
                  <>
                    <input type="hidden" name="record_id" value={r.id ?? ""} />
                    <select
                      aria-label={`Attendance for ${r.name}`}
                      name="attendance_status"
                      value={r.status}
                      onChange={(e) => change(i, "status", e.target.value)}
                      className="min-h-10 w-full rounded-lg border bg-white px-3 py-2"
                    >
                      {attendanceStatuses
                        .filter((s) => !canCorrect || s !== "unmarked")
                        .map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                    </select>
                  </>
                ) : (
                  <span className="capitalize">{r.status}</span>
                )}
              </td>
              <td className="min-w-28 p-4">
                {editable && r.is_expected ? (
                  <input
                    aria-label={`Late minutes for ${r.name}`}
                    name="late_minutes"
                    type={r.status === "late" ? "number" : "hidden"}
                    value={r.late_minutes ?? ""}
                    onChange={(e) => change(i, "late_minutes", e.target.value)}
                    min={1}
                    max={1440}
                    className="min-h-10 w-24 rounded-lg border px-3 py-2"
                  />
                ) : (
                  (r.late_minutes ?? "—")
                )}
              </td>
              <td className="min-w-60 p-4">
                {editable && r.is_expected ? (
                  <textarea
                    aria-label={`Attendance note for ${r.name}`}
                    name="attendance_note"
                    maxLength={1000}
                    rows={2}
                    value={r.notes}
                    onChange={(e) => change(i, "notes", e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {r.notes || "—"}
                  </p>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="p-8 text-center text-muted-foreground">
                No students on this roster page.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-5">
      {editable && rows.some((r) => r.is_expected) ? (
        <ActionForm
          action={canCorrect ? correctAttendance : saveAttendance}
          submit={
            canCorrect ? "Save authorized correction" : "Save attendance draft"
          }
          confirmation={
            canCorrect
              ? "Correct finalized attendance? Previous values and your reason remain in the audit trail."
              : undefined
          }
        >
          <Hidden identity={identity} request={saveRequest} />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => markPage("present")}
            >
              Mark page Present
            </Button>
            {!canCorrect && (
              <Button
                type="button"
                variant="outline"
                onClick={() => markPage("unmarked")}
              >
                Clear page to Unmarked
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!dirty}
              onClick={() => setRows(initial)}
            >
              Undo page edits
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {dirty
              ? "Unsaved attendance changes on this page. Save before changing pages or finalizing."
              : "Showing saved attendance. Bulk actions affect this page only."}
          </p>
          {table}
          {canCorrect && (
            <Field
              label="Required correction reason"
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          )}
        </ActionForm>
      ) : (
        table
      )}
      {canManage && (
        <section className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Review enrollment roster</h2>
          <p className="text-sm text-muted-foreground">
            {rosterChanged
              ? "Enrollment eligibility changed since this draft roster was prepared. Review it before finalizing."
              : "This draft keeps a reviewed roster. Use this action after a relevant enrollment change."}{" "}
            Removed unmarked rows remain in history; clear affected draft marks
            first if their enrollment reference changed.
          </p>
          {!dirty ? (
            <ActionForm
              action={refreshAttendanceRoster}
              submit="Review enrollment roster"
            >
              <Hidden identity={identity} request={reviewRequest} />
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              Save page edits before reviewing the roster.
            </p>
          )}
        </section>
      )}
      {canFinalize && (
        <section className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Finalize attendance</h2>
          <p className="text-sm text-muted-foreground">
            Finalization locks all expected students across every page. It does
            not complete the lesson or post financial entries. Later corrections
            require special permission and a reason.
          </p>
          {unmarked > 0 ? (
            <p role="status" className="text-sm text-amber-800">
              {unmarked} students remain Unmarked. Mark and save every expected
              student before finalizing.
            </p>
          ) : dirty ? (
            <p className="text-sm text-muted-foreground">
              Save your page changes before finalizing.
            </p>
          ) : rosterChanged ? (
            <p className="text-sm text-amber-800">
              Review the changed enrollment roster before finalizing.
            </p>
          ) : (
            <ActionForm
              action={finalizeAttendance}
              submit="Finalize attendance"
              confirmation="Finalize the saved attendance for every expected student?"
            >
              <Hidden identity={identity} request={finalizeRequest} />
              <label className="flex items-start gap-3 text-sm">
                <input
                  name="confirm_finalization"
                  type="checkbox"
                  required
                  className="mt-1"
                />
                <span>
                  I reviewed the saved marks for all roster pages and confirm
                  finalization.
                </span>
              </label>
              {expected === 0 && (
                <label className="flex items-start gap-3 text-sm">
                  <input
                    name="confirm_empty"
                    type="checkbox"
                    required
                    className="mt-1"
                  />
                  <span>
                    I explicitly confirm this lesson has an empty expected
                    roster.
                  </span>
                </label>
              )}
            </ActionForm>
          )}
        </section>
      )}
    </div>
  );
}
