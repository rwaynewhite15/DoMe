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
import { TaskForm } from "@/components/TaskForm";
import { AssigneeAvatar, EmptyState, PointsBadge } from "@/components/ui";
import { CheckIcon, DragIcon, MoreIcon, PlusIcon } from "@/components/icons";
import {
  completeOccurrenceAction,
  reorderOccurrencesAction,
  rescheduleOccurrenceAction,
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
          <DayColumn key={day.key} day={day} />
        ))}
      </DndContext>

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

function DayColumn({ day }: { day: DayState }) {
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
            day.items.map((occ) => <OccurrenceRow key={occ.id} occ={occ} />)
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function OccurrenceRow({ occ }: { occ: OccurrenceDTO }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: occ.id });
  const [pending, startTransition] = useTransition();
  const [editingPts, setEditingPts] = useState(false);
  const [pts, setPts] = useState(String(occ.points));
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div
      ref={setNodeRef}
      style={style}
      className={`card flex items-center gap-2 p-2.5 ${
        done ? "opacity-60" : ""
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

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-sm font-medium ${
            done ? "text-zinc-400 line-through" : "text-zinc-800"
          }`}
        >
          {occ.title}
        </div>
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
      </div>

      {editingPts ? (
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
      ) : (
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
      )}

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
            <div className="card absolute right-0 z-20 mt-1 w-36 overflow-hidden p-1 text-sm">
              <button
                onClick={skip}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100"
              >
                Skip this day
              </button>
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
  );
}
