"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  WEEKLY_BUDGET,
  getWeeklyUsage,
  isInWindow,
} from "@/lib/budget";
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

  const tz = user.household.timezone;
  if (isInWindow(occ.date, tz)) {
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

export async function completeOccurrenceAction(
  occurrenceId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const occ = await prisma.taskOccurrence.findFirst({
    where: { id: occurrenceId, task: { householdId: user.householdId } },
    include: { task: { include: { assigner: true, assignee: true } } },
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

  const assigner = occ.task.assigner;
  if (assigner.notifyOnComplete && assigner.id !== user.id) {
    const { subject, html } = taskCompletedEmail({
      recipientName: assigner.name,
      completerName: user.name,
      taskTitle: occ.task.title,
      points: occ.points,
    });
    await sendEmail({ to: assigner.email, subject, html });
  }

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
