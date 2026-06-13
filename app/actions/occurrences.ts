"use server";

import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  WEEKLY_BUDGET,
  getWeeklyUsage,
  isInWindow,
} from "@/lib/budget";
import { localDateTimeToUtc } from "@/lib/dates";
import { sendEmail, taskCompletedEmail } from "@/lib/email";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/points");
}

export async function updateOccurrencePointsAction(
  occurrenceId: string,
  points: number,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!Number.isInteger(points) || points < 0 || points > WEEKLY_BUDGET) {
    return { ok: false, error: `Points must be between 0 and ${WEEKLY_BUDGET}.` };
  }

  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
    include: { task: true },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };
  if (occ.status === "COMPLETED") {
    return { ok: false, error: "Points are locked once a task is completed." };
  }
  // Any household member can adjust points on any task. Points still count
  // against the assigner's weekly budget, so the gate below stays tied to them.

  const tz = user.household.timezone;
  // Unassigned ("Anyone") tasks consume no one's budget, so they are never gated.
  if (occ.task.assigneeId && isInWindow(occ.date, tz)) {
    const usedOther = await getWeeklyUsage(occ.task.assignerId, tz, {
      excludeOccurrenceId: occ.id,
    });
    if (usedOther + points > WEEKLY_BUDGET) {
      return {
        ok: false,
        error: `Only ${WEEKLY_BUDGET - usedOther} points left in the assigner's weekly budget.`,
      };
    }
  }

  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: { points, pointsEdited: true },
  });
  revalidateAll();
  return { ok: true };
}

/** Upper bound on how many units one occurrence can log, to keep things sane. */
const MAX_QUANTITY = 99;

/**
 * Set how many units were done for a quantity task (e.g. 3 loads of laundry).
 * The occurrence's points are recomputed as the task's per-unit points ×
 * quantity. Quantity tasks are open-ended, so this deliberately does NOT gate on
 * the weekly budget — doing extra work can push the assigner past their cap.
 */
export async function setOccurrenceQuantityAction(
  occurrenceId: string,
  quantity: number,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, error: `Quantity must be between 1 and ${MAX_QUANTITY}.` };
  }

  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
    include: { task: true },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };
  if (!occ.task.hasQuantity) {
    return { ok: false, error: "This task doesn't track a quantity." };
  }
  if (occ.status === "COMPLETED") {
    return { ok: false, error: "Quantity is locked once a task is completed." };
  }

  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: { quantity, points: occ.task.defaultPoints * quantity },
  });
  revalidateAll();
  return { ok: true };
}

export async function completeOccurrenceAction(
  occurrenceId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
    include: { task: true },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };
  if (occ.status === "COMPLETED") {
    revalidateAll();
    return { ok: true };
  }

  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completedById: user.id,
    },
  });

  // Notify every household member who has opted in, regardless of who created
  // or completed the task.
  const recipients = await prisma.user.findMany({
    where: { householdId: user.householdId, notifyOnComplete: true },
  });
  for (const recipient of recipients) {
    const { subject, html } = taskCompletedEmail({
      recipientName: recipient.name,
      completerName: user.name,
      taskTitle: occ.task.title,
      points: occ.points,
    });
    await sendEmail({ to: recipient.email, subject, html });
  }

  revalidateAll();
  return { ok: true };
}

/**
 * Reassign who gets credit for completing an occurrence. Completion defaults to
 * the person who checks it off, but anyone in the household can attribute it to
 * the member who actually did it (e.g. checking off a task someone else
 * finished). Points are tied to the assigner's budget, not the completer, so
 * this never touches anyone's weekly budget — though for unassigned ("Anyone")
 * tasks it does move who the earned points are credited to.
 */
export async function setOccurrenceCompletedByAction(
  occurrenceId: string,
  completedById: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };
  if (occ.status !== "COMPLETED") {
    return { ok: false, error: "Only a completed task has a completed-by." };
  }

  const member = await prisma.user.findFirst({
    where: { id: completedById, householdId: user.householdId },
    select: { id: true },
  });
  if (!member) {
    return { ok: false, error: "That person isn't part of this household." };
  }

  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: { completedById },
  });
  revalidateAll();
  return { ok: true };
}

export async function uncompleteOccurrenceAction(
  occurrenceId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };

  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: { status: "PENDING", completedAt: null, completedById: null },
  });
  revalidateAll();
  return { ok: true };
}

export async function skipOccurrenceAction(
  occurrenceId: string,
  skip = true,
): Promise<ActionResult> {
  const user = await requireUser();
  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };

  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: { status: skip ? "SKIPPED" : "PENDING" },
  });
  revalidateAll();
  return { ok: true };
}

/**
 * Move a single (non-recurring) occurrence to a different calendar day,
 * preserving its local time-of-day. Recurring instances are not movable
 * because the daily materialization would recreate them on the original day.
 */
export async function rescheduleOccurrenceAction(
  occurrenceId: string,
  newDayKey: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDayKey)) {
    return { ok: false, error: "Invalid date." };
  }

  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
    include: { task: true },
  });
  if (!occ) return { ok: false, error: "Task occurrence not found." };
  if (occ.task.isRecurring) {
    return {
      ok: false,
      error: "Repeating tasks can’t be moved to another day. Edit the series instead.",
    };
  }

  const tz = user.household.timezone;
  // Tasks are date-only; only timed events keep their clock time when moved.
  const dateOnly = occ.task.kind === "TASK" || occ.task.allDay;
  const time = dateOnly ? undefined : formatInTimeZone(occ.date, tz, "HH:mm");
  const newDate = localDateTimeToUtc(newDayKey, time, tz, dateOnly);
  if (newDate.getTime() === occ.date.getTime()) return { ok: true };

  // A non-recurring task has a single occurrence, so keep the parent task's
  // startAt in sync — otherwise re-materialization would recreate the old day.
  await prisma.taskOccurrence.update({
    where: { id: occ.id },
    data: { date: newDate },
  });
  await prisma.task.update({
    where: { id: occ.task.id },
    data: { startAt: newDate },
  });
  revalidateAll();
  return { ok: true };
}

/** Persist a new manual order for a set of occurrences (e.g. one day's list). */
export async function reorderOccurrencesAction(
  orderedIds: string[],
): Promise<ActionResult> {
  const user = await requireUser();
  if (orderedIds.length === 0) return { ok: true };

  const owned = await prisma.taskOccurrence.findMany({
    where: { id: { in: orderedIds }, task: { householdId: user.householdId } },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    return { ok: false, error: "Some items could not be reordered." };
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.taskOccurrence.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true };
}
