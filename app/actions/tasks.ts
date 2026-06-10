"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { taskSchema } from "@/lib/validation";
import { localDateTimeToUtc, weekWindow } from "@/lib/dates";
import {
  buildRRuleString,
  materializeForTask,
  type RecurrenceInput,
} from "@/lib/recurrence";
import {
  WEEKLY_BUDGET,
  getWeeklyUsage,
  pointsForDraftInWindow,
} from "@/lib/budget";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/tasks");
  revalidatePath("/points");
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the task details and try again." };
  }
  const d = parsed.data;
  const tz = user.household.timezone;

  // An empty assignee means the task is left for anyone / no one.
  const assigneeId = d.assigneeId ? d.assigneeId : null;
  if (assigneeId) {
    if (assigneeId === user.id) {
      return { ok: false, error: "You can't assign a task to yourself." };
    }
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, householdId: user.householdId },
    });
    if (!assignee) {
      return { ok: false, error: "Assignee is not part of this household." };
    }
  }

  // Only events are time-bound. A task is anchored to a day, not a clock time,
  // so it's stored at the start of its local day with no time of day.
  const allDay = d.kind === "EVENT" ? !!d.allDay : false;
  const timed = d.kind === "EVENT" && !allDay;
  const startAt = localDateTimeToUtc(d.date, timed ? d.time : undefined, tz, !timed);
  const recurrenceRule = buildRRuleString({
    freq: d.freq,
    interval: d.interval,
    weekdays: d.weekdays,
  } as RecurrenceInput);
  const isRecurring = recurrenceRule !== null;

  // Budget check (only points placed inside the current rolling window count).
  // Unassigned ("Anyone") tasks consume no one's budget, so skip it.
  if (assigneeId && d.defaultPoints > 0) {
    const draft = {
      startAt,
      isRecurring,
      recurrenceRule,
      defaultPoints: d.defaultPoints,
    };
    const adding = pointsForDraftInWindow(draft, tz);
    if (adding > 0) {
      const used = await getWeeklyUsage(user.id, tz);
      if (used + adding > WEEKLY_BUDGET) {
        return {
          ok: false,
          error: `That would use ${adding} points but you only have ${
            WEEKLY_BUDGET - used
          } left in your weekly budget.`,
        };
      }
    }
  }

  const task = await prisma.task.create({
    data: {
      householdId: user.householdId,
      title: d.title,
      description: d.description || null,
      location: d.location || null,
      kind: d.kind,
      assignerId: user.id,
      assigneeId,
      defaultPoints: d.defaultPoints,
      isRecurring,
      recurrenceRule,
      startAt,
      allDay,
    },
  });

  await materializeForTask(task);
  revalidateAll();
  return { ok: true };
}

export async function updateTaskAction(
  taskId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the task details and try again." };
  }
  const d = parsed.data;
  const tz = user.household.timezone;

  const task = await prisma.task.findFirst({
    where: { id: taskId, householdId: user.householdId },
  });
  if (!task) return { ok: false, error: "Task not found." };

  // An empty assignee means the task is left for anyone / no one.
  const assigneeId = d.assigneeId ? d.assigneeId : null;
  if (assigneeId) {
    if (assigneeId === task.assignerId) {
      return { ok: false, error: "You can't assign a task to its creator." };
    }
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, householdId: user.householdId },
    });
    if (!assignee) {
      return { ok: false, error: "Assignee is not part of this household." };
    }
  }

  // Budget check for the new default points propagating to pending occurrences.
  // Unassigned ("Anyone") tasks consume no one's budget, so skip it.
  if (assigneeId && d.defaultPoints > 0) {
    const { start, end } = weekWindow(tz);
    const inWindow = await prisma.taskOccurrence.findMany({
      where: {
        taskId: task.id,
        date: { gte: start, lte: end },
        status: { not: "SKIPPED" },
      },
      select: { points: true, status: true, pointsEdited: true },
    });
    const thisSum = inWindow.reduce((sum, o) => {
      const usesNewDefault = o.status === "PENDING" && !o.pointsEdited;
      return sum + (usesNewDefault ? d.defaultPoints : o.points);
    }, 0);
    const usedOther = await getWeeklyUsage(task.assignerId, tz, {
      excludeTaskId: task.id,
    });
    if (usedOther + thisSum > WEEKLY_BUDGET) {
      return {
        ok: false,
        error: `That default would push ${task.assignerId === user.id ? "your" : "the assigner's"} weekly total to ${
          usedOther + thisSum
        } (max ${WEEKLY_BUDGET}).`,
      };
    }
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      title: d.title,
      description: d.description || null,
      location: d.location || null,
      kind: d.kind,
      assigneeId,
      defaultPoints: d.defaultPoints,
    },
  });

  // Propagate new default to pending, un-edited occurrences.
  await prisma.taskOccurrence.updateMany({
    where: { taskId: task.id, status: "PENDING", pointsEdited: false },
    data: { points: d.defaultPoints },
  });

  // For single (non-recurring) tasks, allow moving the date/time.
  if (!task.isRecurring) {
    const allDay = d.kind === "EVENT" ? !!d.allDay : false;
    const timed = d.kind === "EVENT" && !allDay;
    const newStart = localDateTimeToUtc(d.date, timed ? d.time : undefined, tz, !timed);
    if (newStart.getTime() !== task.startAt.getTime() || allDay !== task.allDay) {
      await prisma.task.update({
        where: { id: task.id },
        data: { startAt: newStart, allDay },
      });
      await prisma.taskOccurrence.updateMany({
        where: { taskId: task.id, status: "PENDING" },
        data: { date: newStart },
      });
    }
  }

  revalidateAll();
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const user = await requireUser();
  const task = await prisma.task.findFirst({
    where: { id: taskId, householdId: user.householdId },
  });
  if (!task) return { ok: false, error: "Task not found." };

  await prisma.task.delete({ where: { id: task.id } });
  revalidateAll();
  return { ok: true };
}

export async function setTaskActiveAction(
  taskId: string,
  active: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  const task = await prisma.task.findFirst({
    where: { id: taskId, householdId: user.householdId },
  });
  if (!task) return { ok: false, error: "Task not found." };

  await prisma.task.update({ where: { id: task.id }, data: { active } });
  revalidateAll();
  return { ok: true };
}
