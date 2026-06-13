import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { endOfLocalDay, localDayKey, startOfLocalDay } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";

export interface MemberRef {
  id: string;
  name: string;
  color: string;
}

export interface EarnedDTO {
  member: MemberRef;
  earned: number;
}

/**
 * Points each member has earned by completing tasks scheduled for today. The
 * assignee earns; unassigned ("Anyone") tasks credit whoever completed them.
 * Scoped to occurrences dated today, so an overdue / carried-over task finished
 * today counts toward the day it was due — not today's total. (The leaderboard
 * and trend still bucket by completedAt, which is the right lens for those.)
 */
export async function getDailyEarned(
  householdId: string,
  tz: string,
): Promise<EarnedDTO[]> {
  const members = await prisma.user.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });

  const now = new Date();
  const completed = await prisma.taskOccurrence.findMany({
    where: {
      status: "COMPLETED",
      date: { gte: startOfLocalDay(now, tz), lte: endOfLocalDay(now, tz) },
      task: { householdId },
    },
    select: {
      points: true,
      completedById: true,
      task: { select: { assigneeId: true } },
    },
  });

  const totals: Record<string, number> = {};
  for (const o of completed) {
    const uid = o.task.assigneeId ?? o.completedById;
    if (!uid) continue;
    totals[uid] = (totals[uid] ?? 0) + o.points;
  }

  return members.map((m) => ({ member: m, earned: totals[m.id] ?? 0 }));
}

export interface TrendBucket {
  date: string; // label, e.g. "Jun 9"
  key: string; // yyyy-MM-dd
  [userId: string]: number | string;
}

export interface TrendResult {
  members: MemberRef[];
  daily: TrendBucket[];
  cumulative: TrendBucket[];
  totals: Record<string, number>; // userId -> all-time completed points
}

/** All-time completed points earned per member (the doer/assignee earns). */
export async function getLeaderboard(
  householdId: string,
): Promise<{ member: MemberRef; total: number }[]> {
  const members = await prisma.user.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });

  const completed = await prisma.taskOccurrence.findMany({
    where: { status: "COMPLETED", task: { householdId } },
    select: {
      points: true,
      completedById: true,
      task: { select: { assigneeId: true } },
    },
  });

  const totals: Record<string, number> = {};
  for (const o of completed) {
    // Unassigned ("anyone") tasks credit whoever completed them.
    const uid = o.task.assigneeId ?? o.completedById;
    if (!uid) continue;
    totals[uid] = (totals[uid] ?? 0) + o.points;
  }

  return members.map((m) => ({ member: m, total: totals[m.id] ?? 0 }));
}

/** Daily + cumulative completed points per member over the last `days` days. */
export async function getTrend(
  householdId: string,
  tz: string,
  days = 30,
): Promise<TrendResult> {
  const members = await prisma.user.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });

  const since = startOfLocalDay(subDays(new Date(), days - 1), tz);

  const completed = await prisma.taskOccurrence.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: since },
      task: { householdId },
    },
    select: {
      points: true,
      completedAt: true,
      completedById: true,
      task: { select: { assigneeId: true } },
    },
  });

  // Build ordered day buckets.
  const buckets: TrendBucket[] = [];
  const indexByKey = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const key = localDayKey(d, tz);
    const bucket: TrendBucket = {
      key,
      date: formatInTimeZone(d, tz, "MMM d"),
    };
    for (const m of members) bucket[m.id] = 0;
    indexByKey.set(key, buckets.length);
    buckets.push(bucket);
  }

  const totals: Record<string, number> = {};
  for (const o of completed) {
    // Unassigned ("anyone") tasks credit whoever completed them.
    const uid = o.task.assigneeId ?? o.completedById;
    if (!uid) continue;
    totals[uid] = (totals[uid] ?? 0) + o.points;
    if (!o.completedAt) continue;
    const key = localDayKey(o.completedAt, tz);
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;
    buckets[idx][uid] = (buckets[idx][uid] as number) + o.points;
  }

  // Cumulative running totals across the window.
  const running: Record<string, number> = {};
  for (const m of members) running[m.id] = 0;
  const cumulative: TrendBucket[] = buckets.map((b) => {
    const c: TrendBucket = { key: b.key, date: b.date };
    for (const m of members) {
      running[m.id] += b[m.id] as number;
      c[m.id] = running[m.id];
    }
    return c;
  });

  return { members, daily: buckets, cumulative, totals };
}
