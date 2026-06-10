"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
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
import { Avatar, EmptyState, PointsBadge } from "@/components/ui";
import { CheckIcon, DragIcon, MoreIcon, PlusIcon } from "@/components/icons";
import {
  completeOccurrenceAction,
  reorderOccurrencesAction,
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
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <DayColumn key={day.key} day={day} />
      ))}

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

function DayColumn({ day }: { day: DayGroup }) {
  const router = useRouter();
  const signature = day.occurrences
    .map((o) => `${o.id}:${o.status}:${o.points}:${o.sortOrder}`)
    .join("|");

  // Sync local (optimistic) order from props when server data changes,
  // using the render-phase pattern instead of an effect.
  const [items, setItems] = useState(day.occurrences);
  const [prevSig, setPrevSig] = useState(signature);
  if (signature !== prevSig) {
    setPrevSig(signature);
    setItems(day.occurrences);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorderOccurrencesAction(next.map((i) => i.id)).then(() => router.refresh());
  }

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

      {items.length === 0 ? (
        <EmptyState>Nothing scheduled.</EmptyState>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {items.map((occ) => (
                <OccurrenceRow key={occ.id} occ={occ} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
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
  const done = occ.status === "COMPLETED";

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  function toggleComplete() {
    startTransition(async () => {
      const r = done
        ? await uncompleteOccurrenceAction(occ.id)
        : await completeOccurrenceAction(occ.id);
      if (r.ok) router.refresh();
    });
  }

  function savePoints() {
    const n = Number(pts);
    startTransition(async () => {
      const r = await updateOccurrencePointsAction(occ.id, n);
      if (r.ok) {
        setEditingPts(false);
        router.refresh();
      } else {
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
        aria-label="Drag to reorder"
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
          onClick={() => !done && setEditingPts(true)}
          className="shrink-0"
          title={done ? "Points locked" : "Edit points"}
        >
          {occ.points > 0 ? (
            <PointsBadge points={occ.points} muted={done} />
          ) : (
            !done && <span className="text-xs text-zinc-400">+ pts</span>
          )}
        </button>
      )}

      <Avatar name={occ.assignee.name} color={occ.assignee.color} size={26} />

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
