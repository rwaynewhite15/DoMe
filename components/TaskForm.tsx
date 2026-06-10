"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { createTaskAction, updateTaskAction } from "@/app/actions/tasks";
import type { MemberDTO } from "@/lib/queries";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface TaskFormInitial {
  id: string;
  title: string;
  description: string;
  location: string;
  kind: "TASK" | "EVENT";
  assignerId: string;
  assigneeId: string;
  defaultPoints: number;
  date: string;
  time: string;
  allDay: boolean;
  rollover: boolean;
  freq: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  weekdays: number[];
  isRecurring: boolean;
}

export function TaskForm({
  open,
  onClose,
  members,
  currentUserId,
  defaultDate,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  members: MemberDTO[];
  currentUserId: string;
  defaultDate: string;
  initial?: TaskFormInitial;
}) {
  const router = useRouter();
  const editing = !!initial;
  const lockSchedule = editing && initial!.isRecurring;

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // You can't assign a task to yourself: the creator (assigner) is excluded
  // from the list and is never the default.
  const assignerId = initial?.assignerId ?? currentUserId;
  const assignableMembers = members.filter((m) => m.id !== assignerId);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<"TASK" | "EVENT">(initial?.kind ?? "TASK");
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? "");
  const [points, setPoints] = useState(String(initial?.defaultPoints ?? 0));
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [time, setTime] = useState(initial?.time || "09:00");
  const [rollover, setRollover] = useState(initial?.rollover ?? false);
  const [freq, setFreq] = useState(initial?.freq ?? "NONE");
  const [interval, setIntervalValue] = useState(String(initial?.interval ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");

  function toggleWeekday(d: number) {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      title,
      description,
      location,
      kind,
      assigneeId,
      defaultPoints: Number(points) || 0,
      date,
      // Only events are time-bound. Tasks are date-only, and all-day events
      // have no time either.
      time: kind === "EVENT" && !allDay ? time : "",
      allDay: kind === "EVENT" ? allDay : false,
      // "Keep until done" only applies to non-recurring tasks.
      rollover: kind === "TASK" && freq === "NONE" ? rollover : false,
      freq: lockSchedule ? initial!.freq : freq,
      interval: Number(interval) || 1,
      weekdays,
    };
    startTransition(async () => {
      const res = editing
        ? await updateTaskAction(initial!.id, payload)
        : await createTaskAction(payload);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit task" : "New task"}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Take out the trash"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <div className="flex rounded-xl border border-border p-1">
              {(["TASK", "EVENT"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
                    kind === k ? "bg-primary text-white" : "text-zinc-600"
                  }`}
                >
                  {k === "TASK" ? "Task" : "Event"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Assigned to</label>
            <select
              className="input"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Anyone (no one)</option>
              {assignableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">
              {lockSchedule ? "Starts (locked)" : "Date"}
            </label>
            <input
              type="date"
              className="input"
              value={date}
              disabled={lockSchedule}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Points on completion</label>
            <input
              type="number"
              min={0}
              max={100}
              className="input"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
        </div>

        {kind === "EVENT" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All-day event
          </label>
        )}
        {kind === "EVENT" && !allDay && (
          <div>
            <label className="label">Time</label>
            <input
              type="time"
              className="input"
              value={time}
              disabled={lockSchedule}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label">Repeat</label>
          {lockSchedule ? (
            <p className="text-sm text-muted">
              This is a recurring series. Delete and recreate it to change the
              schedule. You can still edit points per day on the calendar.
            </p>
          ) : (
            <select
              className="input"
              value={freq}
              onChange={(e) =>
                setFreq(e.target.value as TaskFormInitial["freq"])
              }
            >
              <option value="NONE">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          )}
        </div>

        {!lockSchedule && freq !== "NONE" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Every</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={52}
                  className="input"
                  value={interval}
                  onChange={(e) => setIntervalValue(e.target.value)}
                />
                <span className="text-sm text-muted">
                  {freq === "DAILY"
                    ? "day(s)"
                    : freq === "WEEKLY"
                      ? "week(s)"
                      : "month(s)"}
                </span>
              </div>
            </div>
          </div>
        )}

        {!lockSchedule && freq === "WEEKLY" && (
          <div>
            <label className="label">On days</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className={`h-9 w-9 rounded-full text-xs font-semibold ${
                    weekdays.includes(i)
                      ? "bg-primary text-white"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {w[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === "TASK" && freq === "NONE" && (
          <label className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={rollover}
              onChange={(e) => setRollover(e.target.checked)}
            />
            <span>
              <span className="font-medium text-zinc-700">
                Keep on the list until it&apos;s done
              </span>
              <span className="block text-xs text-muted">
                If not finished, it carries over to the next day instead of
                disappearing — and only costs its points once.
              </span>
            </span>
          </label>
        )}

        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-zinc-600">
            More details
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="label">Location</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input min-h-20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </details>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1"
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
