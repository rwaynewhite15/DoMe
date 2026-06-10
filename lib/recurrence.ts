import { addDays } from "date-fns";
import { RRule, type Options } from "rrule";
import { prisma } from "@/lib/db";
import type { Task } from "@prisma/client";

/** How far ahead recurring occurrences are materialized. */
export const HORIZON_DAYS = 60;

export type RecurrenceFreq = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface RecurrenceInput {
  freq: RecurrenceFreq;
  interval?: number;
  /** Weekday indexes, 0 = Monday … 6 = Sunday (used for WEEKLY). */
  weekdays?: number[];
}

// index 0..6 == Mon..Sun
const RRULE_WEEKDAYS = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];

/** Build the stored RRULE string (without DTSTART) from simple form input. */
export function buildRRuleString(input: RecurrenceInput): string | null {
  if (input.freq === "NONE") return null;

  const opts: Partial<Options> = {
    freq: RRule[input.freq],
    interval: input.interval && input.interval > 0 ? input.interval : 1,
  };

  if (input.freq === "WEEKLY" && input.weekdays && input.weekdays.length > 0) {
    opts.byweekday = input.weekdays
      .filter((d) => d >= 0 && d <= 6)
      .map((d) => RRULE_WEEKDAYS[d]);
  }

  const rule = new RRule(opts);
  return rule.toString().replace(/^RRULE:/, "");
}

/** Parse a stored rule back into form-friendly fields (best effort). */
export function parseRRuleString(rule: string | null): RecurrenceInput {
  if (!rule) return { freq: "NONE" };
  try {
    const opts = RRule.parseString(rule);
    let freq: RecurrenceFreq = "NONE";
    if (opts.freq === RRule.DAILY) freq = "DAILY";
    else if (opts.freq === RRule.WEEKLY) freq = "WEEKLY";
    else if (opts.freq === RRule.MONTHLY) freq = "MONTHLY";

    const weekdays: number[] = [];
    const byweekday = opts.byweekday;
    if (Array.isArray(byweekday)) {
      for (const wd of byweekday) {
        const n = typeof wd === "number" ? wd : (wd as { weekday: number }).weekday;
        if (typeof n === "number") weekdays.push(n);
      }
    }
    return { freq, interval: opts.interval ?? 1, weekdays };
  } catch {
    return { freq: "NONE" };
  }
}

/** Expand a task into occurrence start instants within [rangeStart, rangeEnd]. */
export function expandOccurrences(
  task: Pick<Task, "startAt" | "isRecurring" | "recurrenceRule">,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  if (!task.isRecurring || !task.recurrenceRule) {
    return task.startAt >= rangeStart && task.startAt <= rangeEnd
      ? [task.startAt]
      : [];
  }
  const opts = RRule.parseString(task.recurrenceRule);
  opts.dtstart = task.startAt;
  const rule = new RRule(opts);
  return rule.between(rangeStart, rangeEnd, true);
}

function defaultSortOrder(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Create any missing TaskOccurrence rows for a task over the rolling horizon.
 * Idempotent thanks to the unique(taskId, date) constraint.
 */
export async function materializeForTask(
  task: Task,
  horizonDays: number = HORIZON_DAYS,
): Promise<void> {
  let dates: Date[];
  if (!task.isRecurring || !task.recurrenceRule) {
    dates = [task.startAt];
  } else {
    const now = new Date();
    const rangeStart = new Date(Math.min(task.startAt.getTime(), now.getTime()));
    const rangeEnd = addDays(now, horizonDays);
    dates = expandOccurrences(task, rangeStart, rangeEnd);
  }
  if (dates.length === 0) return;

  await prisma.taskOccurrence.createMany({
    data: dates.map((d) => ({
      taskId: task.id,
      date: d,
      points: task.defaultPoints,
      sortOrder: defaultSortOrder(d),
    })),
    skipDuplicates: true,
  });
}

/** Materialize occurrences for every active task (used by the daily cron). */
export async function materializeAll(
  horizonDays: number = HORIZON_DAYS,
  householdId?: string,
): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { active: true, ...(householdId ? { householdId } : {}) },
  });
  for (const t of tasks) {
    await materializeForTask(t, horizonDays);
  }
  return tasks.length;
}
