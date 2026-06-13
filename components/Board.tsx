"use client";

import {
  createContext,
  useContext,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
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
  setOccurrenceQuantityAction,
  skipOccurrenceAction,
  uncompleteOccurrenceAction,
  updateOccurrencePointsAction,
  type ActionResult,
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

/* ------------------------------------------------------------------ *
 * Optimistic occurrence store
 *
 * A single source of optimistic truth for a set of day groups, shared by the
 * board (rows + drag/drop) and — on the home page — the points meters. Built on
 * React's useOptimistic so every edit paints instantly and automatically
 * reconciles to fresh server data once the action's transition settles, with no
 * manual mirror/re-sync bookkeeping.
 * ------------------------------------------------------------------ */

type Patch =
  | {
      t: "complete";
      id: string;
      done: boolean;
      completedById: string | null;
      completedByName: string | null;
    }
  | { t: "points"; id: string; points: number }
  | { t: "quantity"; id: string; quantity: number; points: number }
  | { t: "skip"; id: string; skip: boolean }
  | {
      t: "completedBy";
      id: string;
      completedById: string;
      completedByName: string | null;
    }
  | { t: "remove"; taskId: string }
  | { t: "reorder"; dayKey: string; orderedIds: string[] }
  | { t: "reschedule"; id: string; toKey: string; index: number | null };

function mapItem(
  days: DayState[],
  id: string,
  fn: (o: OccurrenceDTO) => OccurrenceDTO,
): DayState[] {
  return days.map((d) => ({
    ...d,
    items: d.items.map((o) => (o.id === id ? fn(o) : o)),
  }));
}

function reduce(days: DayState[], p: Patch): DayState[] {
  switch (p.t) {
    case "complete":
      return mapItem(days, p.id, (o) => ({
        ...o,
        status: p.done ? "COMPLETED" : "PENDING",
        completedById: p.completedById,
        completedByName: p.completedByName,
      }));
    case "points":
      return mapItem(days, p.id, (o) => ({ ...o, points: p.points }));
    case "quantity":
      return mapItem(days, p.id, (o) => ({
        ...o,
        quantity: p.quantity,
        points: p.points,
      }));
    case "skip":
      return mapItem(days, p.id, (o) => ({
        ...o,
        status: p.skip ? "SKIPPED" : "PENDING",
      }));
    case "completedBy":
      return mapItem(days, p.id, (o) => ({
        ...o,
        completedById: p.completedById,
        completedByName: p.completedByName,
      }));
    case "remove":
      return days.map((d) => ({
        ...d,
        items: d.items.filter((o) => o.taskId !== p.taskId),
      }));
    case "reorder":
      return days.map((d) => {
        if (d.key !== p.dayKey) return d;
        const byId = new Map(d.items.map((o) => [o.id, o]));
        const items = p.orderedIds
          .map((id) => byId.get(id))
          .filter((o): o is OccurrenceDTO => !!o);
        return { ...d, items };
      });
    case "reschedule": {
      let moved: OccurrenceDTO | undefined;
      const without = days.map((d) => {
        if (!d.items.some((o) => o.id === p.id)) return d;
        moved = d.items.find((o) => o.id === p.id);
        return { ...d, items: d.items.filter((o) => o.id !== p.id) };
      });
      if (!moved) return days;
      const item = moved;
      return without.map((d) => {
        if (d.key !== p.toKey) return d;
        const items = [...d.items];
        const at =
          p.index == null
            ? items.length
            : Math.max(0, Math.min(items.length, p.index));
        items.splice(at, 0, item);
        return { ...d, items };
      });
    }
  }
}

interface OccStore {
  days: DayState[];
  /** Non-optimistic server truth, for diffing derived values like the meters. */
  baseDays: DayState[];
  members: MemberDTO[];
  currentUserId: string;
  pending: boolean;
  notice: string | null;
  setNotice: (n: string | null) => void;
  complete: (occ: OccurrenceDTO, done: boolean) => void;
  setPoints: (occ: OccurrenceDTO, points: number) => void;
  setQuantity: (occ: OccurrenceDTO, quantity: number) => void;
  skip: (occ: OccurrenceDTO, skip: boolean) => void;
  setCompletedBy: (occ: OccurrenceDTO, memberId: string) => void;
  remove: (taskId: string) => void;
  reorder: (dayKey: string, orderedIds: string[]) => void;
  reschedule: (occ: OccurrenceDTO, toKey: string, index: number | null) => void;
}

const StoreContext = createContext<OccStore | null>(null);

function useOccurrences(): OccStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useOccurrences must be used within OccurrencesProvider");
  return ctx;
}

export function OccurrencesProvider({
  days,
  members,
  currentUserId,
  children,
}: {
  days: DayGroup[];
  members: MemberDTO[];
  currentUserId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const baseDays = toState(days);
  const [optimisticDays, applyPatch] = useOptimistic(baseDays, reduce);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Apply the optimistic patches immediately, run the server action, then pull
  // fresh data on success. On failure the optimistic state unwinds on its own
  // when the transition ends — we just surface the error.
  function run(
    patches: Patch[],
    action: () => Promise<ActionResult>,
    onError: (msg: string) => void = setNotice,
  ) {
    startTransition(async () => {
      for (const p of patches) applyPatch(p);
      const r = await action();
      if (r.ok) router.refresh();
      else onError(r.error);
    });
  }

  const nameOf = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.name ?? null) : null;

  const store: OccStore = {
    days: optimisticDays,
    baseDays,
    members,
    currentUserId,
    pending,
    notice,
    setNotice,
    complete: (occ, done) =>
      run(
        [
          {
            t: "complete",
            id: occ.id,
            done,
            completedById: done ? currentUserId : null,
            completedByName: done ? nameOf(currentUserId) : null,
          },
        ],
        () =>
          done
            ? completeOccurrenceAction(occ.id)
            : uncompleteOccurrenceAction(occ.id),
      ),
    setPoints: (occ, points) =>
      run([{ t: "points", id: occ.id, points }], () =>
        updateOccurrencePointsAction(occ.id, points),
      ),
    setQuantity: (occ, quantity) =>
      run(
        [
          {
            t: "quantity",
            id: occ.id,
            quantity,
            points: occ.pointsPerUnit * quantity,
          },
        ],
        () => setOccurrenceQuantityAction(occ.id, quantity),
      ),
    skip: (occ, skip) =>
      run([{ t: "skip", id: occ.id, skip }], () =>
        skipOccurrenceAction(occ.id, skip),
      ),
    setCompletedBy: (occ, memberId) =>
      run(
        [
          {
            t: "completedBy",
            id: occ.id,
            completedById: memberId,
            completedByName: nameOf(memberId),
          },
        ],
        () => setOccurrenceCompletedByAction(occ.id, memberId),
      ),
    remove: (taskId) =>
      run([{ t: "remove", taskId }], () => deleteTaskAction(taskId)),
    reorder: (dayKey, orderedIds) =>
      run([{ t: "reorder", dayKey, orderedIds }], () =>
        reorderOccurrencesAction(orderedIds),
      ),
    reschedule: (occ, toKey, index) =>
      run([{ t: "reschedule", id: occ.id, toKey, index }], () =>
        rescheduleOccurrenceAction(occ.id, toKey),
      ),
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** Flatten a set of day groups into a single occurrence list. */
export function flattenDays(days: DayState[]): OccurrenceDTO[] {
  return days.flatMap((d) => d.items);
}

/** Hook for consumers (e.g. the points meters) that derive from the store. */
export function useOccurrenceStore(): OccStore {
  return useOccurrences();
}

/* ------------------------------------------------------------------ */

/**
 * Standalone board: owns its optimistic store. Used where the board stands on
 * its own (e.g. the calendar). The home page instead shares one store across
 * the board and the points meters via OccurrencesProvider + BoardCanvas.
 */
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
  return (
    <OccurrencesProvider days={days} members={members} currentUserId={currentUserId}>
      <BoardCanvas defaultDate={defaultDate} showAdd={showAdd} />
    </OccurrencesProvider>
  );
}

export function BoardCanvas({
  defaultDate,
  showAdd = true,
}: {
  defaultDate: string;
  showAdd?: boolean;
}) {
  const { days, members, currentUserId, notice, setNotice, reorder, reschedule } =
    useOccurrences();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormInitial | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  function dayKeyOfItem(id: string): string | undefined {
    return days.find((d) => d.items.some((i) => i.id === id))?.key;
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
      const day = days.find((d) => d.key === toKey)!;
      const oldIndex = day.items.findIndex((i) => i.id === activeId);
      const overIndex = overId.startsWith(DAY_PREFIX)
        ? day.items.length - 1
        : day.items.findIndex((i) => i.id === overId);
      if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return;
      const items = arrayMove(day.items, oldIndex, overIndex);
      reorder(toKey, items.map((i) => i.id));
      return;
    }

    // Different day → reschedule. Only one-off items can change days.
    const occ = days
      .find((d) => d.key === fromKey)!
      .items.find((i) => i.id === activeId)!;
    if (occ.isRecurring) {
      setNotice(
        "Repeating tasks can’t be moved to another day. Edit the series to change its schedule.",
      );
      return;
    }
    const to = days.find((d) => d.key === toKey)!;
    const overIndex = overId.startsWith(DAY_PREFIX)
      ? to.items.length
      : to.items.findIndex((i) => i.id === overId);
    reschedule(occ, toKey, overIndex < 0 ? null : overIndex);
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
        {days.map((day) => (
          <DayColumn key={day.key} day={day} onEdit={setEditing} />
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
  onEdit,
}: {
  day: DayState;
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
              <OccurrenceRow key={occ.id} occ={occ} onEdit={onEdit} />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function OccurrenceRow({
  occ,
  onEdit,
}: {
  occ: OccurrenceDTO;
  onEdit: (initial: TaskFormInitial) => void;
}) {
  const store = useOccurrences();
  // Any household member can adjust the points on any task.
  const canEditPoints = true;
  const done = occ.status === "COMPLETED";
  const skipped = occ.status === "SKIPPED";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: occ.id });
  const [editingPts, setEditingPts] = useState(false);
  const [pts, setPts] = useState(String(occ.points));
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  function savePoints() {
    const n = Number(pts);
    if (!Number.isFinite(n)) return;
    setEditingPts(false);
    store.setPoints(occ, n);
  }

  function changeQty(next: number) {
    const q = Math.max(1, Math.min(99, next));
    if (q === occ.quantity || done) return;
    store.setQuantity(occ, q);
  }

  function skip() {
    setMenuOpen(false);
    store.skip(occ, true);
  }

  function unskip() {
    setMenuOpen(false);
    store.skip(occ, false);
  }

  function edit() {
    setMenuOpen(false);
    setDetailsOpen(false);
    onEdit(occ.initial);
  }

  function del() {
    setMenuOpen(false);
    if (!confirm("Delete this task and all of its occurrences?")) return;
    store.remove(occ.taskId);
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
          onClick={() => store.complete(occ, !done)}
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

      {!skipped && occ.hasQuantity ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-border">
            <button
              type="button"
              onClick={() => changeQty(occ.quantity - 1)}
              disabled={done || occ.quantity <= 1}
              className="px-2 py-1 text-sm font-bold text-zinc-500 disabled:opacity-30"
              aria-label="One fewer"
            >
              −
            </button>
            <span className="min-w-[2.75rem] px-0.5 text-center text-xs font-semibold tabular-nums text-zinc-700">
              {occ.quantity}
              {occ.unit ? ` ${occ.unit}` : ""}
            </span>
            <button
              type="button"
              onClick={() => changeQty(occ.quantity + 1)}
              disabled={done}
              className="px-2 py-1 text-sm font-bold text-zinc-500 disabled:opacity-30"
              aria-label="One more"
            >
              +
            </button>
          </div>
          {occ.points > 0 && <PointsBadge points={occ.points} muted={done} />}
        </div>
      ) : !skipped && (editingPts && canEditPoints ? (
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
            className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white"
          >
            Save
          </button>
        </div>
      ) : canEditPoints ? (
        <button
          onClick={() => {
            if (done) return;
            setPts(String(occ.points));
            setEditingPts(true);
          }}
          className="shrink-0"
          title={done ? "Points locked" : "Edit points"}
        >
          {occ.points > 0 ? (
            <PointsBadge points={occ.points} muted={done} />
          ) : (
            !done && <span className="text-xs text-zinc-400">+ pts</span>
          )}
        </button>
      ) : (
        occ.points > 0 && (
          <span className="shrink-0" title="Set by the assigner">
            <PointsBadge points={occ.points} muted={done} />
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
  open,
  onClose,
  onEdit,
}: {
  occ: OccurrenceDTO;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const store = useOccurrences();

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
        {occ.hasQuantity && (
          <DetailRow label="Quantity">
            {occ.quantity}
            {occ.unit ? ` ${occ.unit}${occ.quantity === 1 ? "" : "s"}` : ""}
            {occ.pointsPerUnit > 0 ? ` · ${occ.pointsPerUnit} pt${occ.pointsPerUnit === 1 ? "" : "s"} each` : ""}
          </DetailRow>
        )}
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
              value={occ.completedById ?? ""}
              disabled={store.pending}
              onChange={(e) => store.setCompletedBy(occ, e.target.value)}
              aria-label="Completed by"
            >
              {!occ.completedById && (
                <option value="" disabled>
                  Select…
                </option>
              )}
              {store.members.map((m) => (
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
