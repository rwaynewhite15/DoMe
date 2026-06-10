import { prisma } from "@/lib/db";
import { weekWindow } from "@/lib/dates";
import { expandOccurrences } from "@/lib/recurrence";

/** Points each member may assign within any rolling 7-day window. */
export const WEEKLY_BUDGET = 100;

export class BudgetError extends Error {
  remaining: number;
  attempted: number;
  constructor(remaining: number, attempted: number) {
    super(
      `Over weekly budget: ${attempted} points requested but only ${remaining} of ${WEEKLY_BUDGET} remain this week.`,
    );
    this.name = "BudgetError";
    this.remaining = remaining;
    this.attempted = attempted;
  }
}

interface UsageOpts {
  anchor?: Date;
  excludeOccurrenceId?: string;
  excludeTaskId?: string;
}

/**
 * Sum of points an assigner has committed to occurrences inside the current
 * rolling week window. Completed occurrences still count (the budget was spent);
 * skipped ones do not. Unassigned ("Anyone") tasks consume no one's budget.
 */
export async function getWeeklyUsage(
  userId: string,
  tz: string,
  opts: UsageOpts = {},
): Promise<number> {
  const { start, end } = weekWindow(tz, opts.anchor);
  const rows = await prisma.taskOccurrence.findMany({
    where: {
      date: { gte: start, lte: end },
      status: { not: "SKIPPED" },
      ...(opts.excludeOccurrenceId ? { id: { not: opts.excludeOccurrenceId } } : {}),
      task: {
        assignerId: userId,
        assigneeId: { not: null },
        active: true,
        ...(opts.excludeTaskId ? { id: { not: opts.excludeTaskId } } : {}),
      },
    },
    select: { points: true },
  });
  return rows.reduce((sum, r) => sum + r.points, 0);
}

export async function getRemainingBudget(
  userId: string,
  tz: string,
  anchor?: Date,
): Promise<number> {
  const used = await getWeeklyUsage(userId, tz, { anchor });
  return Math.max(0, WEEKLY_BUDGET - used);
}

/** Is this occurrence date inside the current rolling week window? */
export function isInWindow(date: Date, tz: string, anchor?: Date): boolean {
  const { start, end } = weekWindow(tz, anchor);
  return date >= start && date <= end;
}

/**
 * How many points a not-yet-created task would place inside the current window
 * (occurrence count in window × default points).
 */
export function pointsForDraftInWindow(
  draft: {
    startAt: Date;
    isRecurring: boolean;
    recurrenceRule: string | null;
    defaultPoints: number;
  },
  tz: string,
  anchor?: Date,
): number {
  const { start, end } = weekWindow(tz, anchor);
  const dates = expandOccurrences(draft, start, end);
  return dates.length * draft.defaultPoints;
}
