"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberDTO, TaskListItemDTO } from "@/lib/queries";
import { TaskForm, type TaskFormInitial } from "@/components/TaskForm";
import { AssigneeAvatar, EmptyState, PointsBadge } from "@/components/ui";
import { MoreIcon, PlusIcon } from "@/components/icons";
import { deleteTaskAction, setTaskActiveAction } from "@/app/actions/tasks";

export function TasksManager({
  tasks,
  members,
  currentUserId,
  defaultDate,
}: {
  tasks: TaskListItemDTO[];
  members: MemberDTO[];
  currentUserId: string;
  defaultDate: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskFormInitial | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-muted">{tasks.length} defined</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <PlusIcon width={18} height={18} /> New
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState>No tasks yet. Create your first one.</EmptyState>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onEdit={() => setEditing(t.initial)} />
          ))}
        </div>
      )}

      <TaskForm
        key={creating ? "create-open" : "create-closed"}
        open={creating}
        onClose={() => setCreating(false)}
        members={members}
        currentUserId={currentUserId}
        defaultDate={defaultDate}
      />
      <TaskForm
        key={editing ? `edit-${editing.id}` : "edit-closed"}
        open={!!editing}
        onClose={() => setEditing(null)}
        members={members}
        currentUserId={currentUserId}
        defaultDate={defaultDate}
        initial={editing ?? undefined}
      />
    </div>
  );
}

function TaskRow({
  task,
  onEdit,
}: {
  task: TaskListItemDTO;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleActive() {
    setMenuOpen(false);
    startTransition(async () => {
      const r = await setTaskActiveAction(task.id, !task.active);
      if (r.ok) router.refresh();
    });
  }

  function del() {
    setMenuOpen(false);
    if (!confirm("Delete this task and all of its occurrences?")) return;
    startTransition(async () => {
      const r = await deleteTaskAction(task.id);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div
      className={`card flex items-center gap-3 p-3 ${
        task.active ? "" : "opacity-60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-800">
            {task.title}
          </span>
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
            {task.kind}
          </span>
          {!task.active && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              Paused
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted">{task.scheduleLabel}</div>
      </div>

      <PointsBadge points={task.defaultPoints} />
      <AssigneeAvatar member={task.assignee} size={26} />

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
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100"
              >
                Edit
              </button>
              <button
                onClick={toggleActive}
                disabled={pending}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100"
              >
                {task.active ? "Pause" : "Resume"}
              </button>
              <button
                onClick={del}
                disabled={pending}
                className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
