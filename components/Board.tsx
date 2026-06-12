"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MemberDTO, OccurrenceDTO } from "@/lib/queries";
import { TaskForm, type TaskFormInitial } from "@/components/TaskForm";
import { Modal } from "@/components/Modal";
import { AssigneeAvatar, EmptyState, PointsBadge } from "@/components/ui";
import { CheckIcon, DragIcon, MoreIcon, PlusIcon } from "@/components/icons";
import {
  completeOccurrenceAction,
  reorderOccurrencesAction,
  rescheduleOccurrenceAction,
  setOccurrenceCompletedByAction,
  skipOccurrenceAction,
  uncompleteOccurrenceAction,
  updateOccurrencePointsAction,
} from "@/app/actions/occurrences";
import { deleteTaskAction } from "@/app/actions/tasks";

export interface DayGroup {
  key: string;
  label: string;
  isToday: boolean;
  occurrences: OccurrenceDTO[];
}

interface DayState {
  key: string;
  label: string;
  isToday: boolean;
  items: OccurrenceDTO[];
}

const DAY_PREFIX = "day:";

function toState(days: DayGroup[]): DayState[] {
  return days.map((d) => ({
    key: d.key,
    label: d.label,
    isToday: d.isToday,
    items: d.occurrences,
  }));
}

export function Board({
  days,
  members,
  currentUserId,
  defaultDate,
  showAdd = true,
}: {
  days: DayGroup[];
  members: MemberDTO[];
  currentUserId: string;
  defaultDate: string;
  showAdd?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormInitial | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Local (optimistic) copy of the day groups, re-synced from props when the
  // server data changes (render-phase pattern, no effect).
  const signature = days
    .map(
      (d) =>
        d.key +
        ":" +
        d.occurrences
          .map((o) => `${o.id}.${o.status}.${o.points}.${o.sortOrder}`)
          .join(","),
    )
    .join("|");
  const [state, setState] = useState<DayState[]>(() => toState(days));
  const [prevSig, setPrevSig] = useState(signature);
  if (signature !== prevSig) {
    setPrevSig(signature);
    setState(toState(days));
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  function dayKeyOfItem(id: string): string | undefined {
    return state.find((d) => d.items.some((i) => i.id === id))?.key;
  }

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    const fromKey = dayKeyOfItem(activeId);
    if (!fromKey) return;
    const toKey = overId.startsWith(DAY_PREFIX)
      ? overId.slice(DAY_PREFIX.length)
      : dayKeyOfItem(overId);
    if (!toKey) return;

    // Same day → reorder.
    if (fromKey === toKey) {
      const day = state.find((d) => d.key === toKey)!;
      const oldIndex = day.items.findIndex((i) => i.id === activeId);
      const overIndex = overId.startsWith(DAY_PREFIX)
        ? day.items.length - 1
        : day.items.findIndex((i) => i.id === overId);
      if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return;
      const items = arrayMove(day.items, oldIndex, overIndex);
      setState((prev) => prev.map((d) => (d.key === toKey ? { ...d, items } : d)));
      reorderOccurrencesAction(items.map((i) => i.id)).then(() =>
        router.refresh(),
      );
      return;
    }

    // Different day → reschedule. Only one-off items can change days.
    const occ = state
      .find((d) => d.key === fromKey)!
      .items.find((i) => i.id === activeId)!;
    if (occ.isRecurring) {
      setNotice(
        "Repeating tasks can’t be moved to another day. Edit the series to change its schedule.",
      );
      return;
    }

    setState((prev) => {
      const next = prev.map((d) => ({ ...d, items: [...d.items] }));
      const from = next.find((d) => d.key === fromKey)!;
      const to = next.find((d) => d.key === toKey)!;
      from.items = from.items.filter((i) => i.id !== activeId);
      const overIndex = overId.startsWith(DAY_PREFIX)
        ? to.items.length
        : to.items.findIndex((i) => i.id === overId);
      to.items.splice(overIndex < 0 ? to.items.length : overIndex, 0, occ);
      return next;
    });

    rescheduleOccurrenceAction(activeId, toKey).then((r) => {
      if (!r.ok) setNotice(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90%] cursor-pointer rounded-full bg-zinc-900 px-4 py-2 text-center text-sm text-white shadow-lg md:bottom-8"
          role="status"
          onClick={() => setNotice(null)}
        >
          {notice}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        {state.map((day) => (
          <DayColumn
            key={day.key}
            day={day}
            members={members}
            onEdit={setEditing}
          />
        ))}
      </DndContext>

      {/* Editing a task is available from anywhere an item is shown. */}
      <TaskForm
        key={editing ? `edit-${editing.id}` : "edit-closed"}
        open={!!editing}
        onClose={() => setEditing(null)}
        members={members}
        currentUserId={currentUserId}
        defaultDate={defaultDate}
        initial={editing ?? undefined}
      />

      {showAdd && (
        <>
          <button
            onClick={() => setFormOpen(true)}
            className="btn-primary fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full p-0 shadow-lg md:bottom-6 md:right-8"
            aria-label="Add task"
          >
            <PlusIcon width={26} height={26} />
          </button>
          <TaskForm
            key={formOpen ? "open" : "closed"}
            open={formOpen}
            onClose={() => setFormOpen(false)}
            members={members}
            currentUserId={currentUserId}
            defaultDate={defaultDate}
          />
        </>
      )}
    </div>
  );
}

function DayColumn({
  day,
  members,
  onEdit,
}: {
  day: DayState;
  members: MemberDTO[];
  onEdit: (initial: TaskFormInitial) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DAY_PREFIX + day.key });

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold text-zinc-700">
          {day.label}
          {day.isToday && (
            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-primary">
              Today
            </span>
          )}
        </h2>
      </div>

      <SortableContext
        items={day.items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`space-y-2 rounded-2xl transition-colors ${
            isOver ? "bg-indigo-50/60 outline-dashed outline-2 outline-indigo-200" : ""
          }`}
        >
          {day.items.length === 0 ? (
            <EmptyState>Nothing scheduled. Drop a task here.</EmptyState>
          ) : (
            day.items.map((occ) => (
              <OccurrenceRow
                key={occ.id}
                occ={occ}
                members={members}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function OccurrenceRow({
  occ,
  members,
  onEdit,
}: {
  occ: OccurrenceDTO;
  members: MemberDTO[];
  onEdit: (initial: TaskFormInitial) => void;
}) {
  const router = useRouter();
  // Any household member can adjust the points on any task.
  const canEditPoints = true;
  const skipped = occ.status === "SKIPPED";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: occ.id });
  const [pending, startTransition] = useTransition();
  const [editingPts, setEditingPts] = useState(false);
  const [pts, setPts] = useState(String(occ.points));
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Optimistic mirrors of server state so check-off and points edits show
  // immediately, then reconcile when router.refresh() lands. Re-synced from
  // props using the render-phase pattern (no effect).
  const [optDone, setOptDone] = useState(occ.status === "COMPLETED");
  const [prevStatus, setPrevStatus] = useState(occ.status);
  if (occ.status !== prevStatus) {
    setPrevStatus(occ.status);
    setOptDone(occ.status === "COMPLETED");
  }
  const [optPoints, setOptPoints] = useState(occ.points);
  const [prevPoints, setPrevPoints] = useState(occ.points);
  if (occ.points !== prevPoints) {
    setPrevPoints(occ.points);
    setOptPoints(occ.points);
  }
  const done = optDone;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  function toggleComplete() {
    const next = !optDone;
    setOptDone(next);
    startTransition(async () => {
      const r = next
        ? await completeOccurrenceAction(occ.id)
        : await uncompleteOccurrenceAction(occ.id);
      if (r.ok) router.refresh();
      else setOptDone(!next);
    });
  }

  function savePoints() {
    const n = Number(pts);
    if (!Number.isFinite(n)) return;
    const prev = optPoints;
    setOptPoints(n);
    setEditingPts(false);
    startTransition(async () => {
      const r = await updateOccurrencePointsAction(occ.id, n);
      if (r.ok) {
        router.refresh();
      } else {
        setOptPoints(prev);
        setPts(String(prev));
        alert(r.error);
      }
    });
  }

  function skip() {
    setMenuOpen(false);
    startTransition(async () => {
      const r = await skipOccurrenceAction(occ.id, true);
      if (r.ok) router.refresh();
    });
  }

  function unskip() {
    setMenuOpen(false);
    startTransition(async () => {
      const r = await skipOccurrenceAction(occ.id, false);
      if (r.ok) router.refresh();
    });
  }

  function edit() {
    setMenuOpen(false);
    setDetailsOpen(false);
    onEdit(occ.initial);
  }

  function del() {
    setMenuOpen(false);
    if (!confirm("Delete this task and all of its occurrences?")) return;
    startTransition(async () => {
      const r = await deleteTaskAction(occ.taskId);
      if (r.ok) router.refresh();
    });
  }

  const meta = [
    occ.allDay ? "All day" : occ.timeLabel,
    occ.location || null,
    occ.isRecurring ? "↻ repeats" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      className={`card flex items-center gap-2 p-2.5 ${
        done || skipped ? "opacity-60" : ""
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      <button
        className="touch-none cursor-grab p-1 text-zinc-300 hover:text-zinc-500"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder or reschedule"
      >
        <DragIcon width={18} height={18} />
      </button>

      {skipped ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-zinc-400"
          aria-hidden
        >
          —
        </span>
      ) : (
        <button
          onClick={toggleComplete}
          disabled={pending}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-zinc-300 text-transparent hover:border-emerald-400"
          }`}
          aria-label={done ? "Mark not done" : "Mark done"}
        >
          <CheckIcon width={16} height={16} />
        </button>
      )}

      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="min-w-0 flex-1 text-left"
        aria-label={`Show details for ${occ.title}`}
      >
        <div
          className={`flex items-center gap-1.5 truncate text-sm font-medium ${
            done ? "text-zinc-400 line-through" : "text-zinc-800"
          }`}
        >
          <span className="truncate">{occ.title}</span>
          {skipped && (
            <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              Skipped
            </span>
          )}
          {occ.carriedOver && !done && (
            <span
              className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700"
              title={`Was due ${occ.dateLabel}`}
            >
              Carried over
            </span>
          )}
        </div>
        {done && occ.completedByName ? (
          <div className="truncate text-xs font-medium text-emerald-600">
            Completed by {occ.completedByName}
          </div>
        ) : (
          meta && <div className="truncate text-xs text-muted">{meta}</div>
        )}
      </button>

      {!skipped && (editingPts && canEditPoints ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={pts}
            onChange={(e) => setPts(e.target.value)}
            className="w-16 rounded-lg border border-border px-2 py-1 text-sm"
            autoFocus
          />
          <button
            onClick={savePoints}
            disabled={pending}
            className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white"
          >
            Save
          </button>
        </div>
      ) : canEditPoints ? (
        <button
          onClick={() => {
            if (done) return;
            setPts(String(optPoints));
            setEditingPts(true);
          }}
          className="shrink-0"
          title={done ? "Points locked" : "Edit points"}
        >
          {optPoints > 0 ? (
            <PointsBadge points={optPoints} muted={done} />
          ) : (
            !done && <span className="text-xs text-zinc-400">+ pts</span>
          )}
        </button>
      ) : (
        optPoints > 0 && (
          <span className="shrink-0" title="Set by the assigner">
            <PointsBadge points={optPoints} muted={done} />
          </span>
        )
      ))}

      <AssigneeAvatar member={occ.assignee} size={26} />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          aria-label="More"
        >
          <MoreIcon width={18} height={18} />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="card absolute right-0 z-20 mt-1 w-40 overflow-hidden p-1 text-sm">
              <button
                onClick={edit}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100"
              >
                Edit
              </button>
              {skipped ? (
                <button
                  onClick={unskip}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100"
                >
                  Restore this day
                </button>
              ) : (
                <button
                  onClick={skip}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100"
                >
                  Skip this day
                </button>
              )}
              <button
                onClick={del}
                className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                Delete task
              </button>
            </div>
          </>
        )}
      </div>
    </div>

    <DetailsModal
      occ={occ}
      members={members}
      open={detailsOpen}
      onClose={() => setDetailsOpen(false)}
      onEdit={edit}
    />
    </>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium text-zinc-800">{children}</span>
    </div>
  );
}

function DetailsModal({
  occ,
  members,
  open,
  onClose,
  onEdit,
}: {
  occ: OccurrenceDTO;
  members: MemberDTO[];
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Completion defaults to whoever checked it off, but it can be reattributed
  // to the member who actually did the task. Re-synced from props with the
  // render-phase pattern (no effect).
  const [completedById, setCompletedById] = useState(occ.completedById ?? "");
  const [prevCompletedById, setPrevCompletedById] = useState(
    occ.completedById ?? "",
  );
  if ((occ.completedById ?? "") !== prevCompletedById) {
    setPrevCompletedById(occ.completedById ?? "");
    setCompletedById(occ.completedById ?? "");
  }

  function changeCompletedBy(id: string) {
    const prev = completedById;
    setCompletedById(id);
    startTransition(async () => {
      const r = await setOccurrenceCompletedByAction(occ.id, id);
      if (r.ok) {
        router.refresh();
      } else {
        setCompletedById(prev);
        alert(r.error);
      }
    });
  }

  const when = [occ.dateLabel, occ.allDay ? "All day" : occ.timeLabel]
    .filter(Boolean)
    .join(" · ");
  const statusLabel =
    occ.status === "COMPLETED"
      ? "Completed"
      : occ.status === "SKIPPED"
        ? "Skipped"
        : "To do";

  return (
    <Modal open={open} onClose={onClose} title={occ.title}>
      <div className="space-y-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
            {occ.kind}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
            {statusLabel}
          </span>
          {occ.isRecurring && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
              ↻ Repeats
            </span>
          )}
        </div>

        <DetailRow label="When">{when}</DetailRow>
        {occ.location && <DetailRow label="Location">{occ.location}</DetailRow>}
        <DetailRow label="Assigned to">
          {occ.assignee?.name ?? "Anyone"}
        </DetailRow>
        <DetailRow label="Created by">{occ.assigner.name}</DetailRow>
        {occ.points > 0 && (
          <DetailRow label="Points">
            {occ.points} pt{occ.points === 1 ? "" : "s"}
          </DetailRow>
        )}
        {occ.status === "COMPLETED" && (
          <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
            <span className="shrink-0 text-muted">Completed by</span>
            <select
              className="max-w-[60%] rounded-lg border border-border px-2 py-1 text-sm font-medium text-zinc-800"
              value={completedById}
              disabled={pending}
              onChange={(e) => changeCompletedBy(e.target.value)}
              aria-label="Completed by"
            >
              {!completedById && (
                <option value="" disabled>
                  Select…
                </option>
              )}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {occ.description ? (
          <div className="pt-3">
            <div className="label">Notes</div>
            <p className="whitespace-pre-wrap text-sm text-zinc-700">
              {occ.description}
            </p>
          </div>
        ) : (
          <p className="pt-3 text-sm text-muted">No notes added.</p>
        )}

        <div className="flex gap-2 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Close
          </button>
          <button type="button" onClick={onEdit} className="btn-primary flex-1">
            Edit
          </button>
        </div>
      </div>
    </Modal>
  );
}
