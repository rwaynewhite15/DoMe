import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { materializeAll } from "@/lib/recurrence";
import { getLeaderboard } from "@/lib/points";
import {
  endOfLocalDay,
  localDayKey,
  startOfLocalDay,
} from "@/lib/dates";
import { dailyDigestEmail, sendEmail } from "@/lib/email";

export interface DailyDigestResult {
  households: number;
  emails: number;
  occurrencesTasks: number;
}

/**
 * Daily job: top up the rolling horizon of recurring occurrences, then send each
 * member a points digest (idempotent per local day via NotificationLog).
 */
export async function runDailyDigest(): Promise<DailyDigestResult> {
  const occurrencesTasks = await materializeAll();

  const households = await prisma.household.findMany({
    include: { users: { orderBy: { createdAt: "asc" } } },
  });

  let emails = 0;

  for (const h of households) {
    const tz = h.timezone;
    const now = new Date();
    const todayStart = startOfLocalDay(now, tz);
    const todayEnd = endOfLocalDay(now, tz);
    const weekStart = startOfLocalDay(subDays(now, 6), tz);
    const todayKey = localDayKey(now, tz);

    const completed = await prisma.taskOccurrence.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: weekStart },
        task: { householdId: h.id },
      },
      select: {
        points: true,
        completedAt: true,
        completedById: true,
        task: { select: { assigneeId: true } },
      },
    });

    const leaderboard = await getLeaderboard(h.id);
    const totalMap: Record<string, number> = {};
    for (const { member, total } of leaderboard) totalMap[member.id] = total;

    const todayMap: Record<string, number> = {};
    const weekMap: Record<string, number> = {};
    for (const o of completed) {
      // Unassigned ("anyone") tasks credit whoever completed them.
      const uid = o.task.assigneeId ?? o.completedById;
      if (!uid) continue;
      weekMap[uid] = (weekMap[uid] ?? 0) + o.points;
      if (o.completedAt && o.completedAt >= todayStart && o.completedAt <= todayEnd) {
        todayMap[uid] = (todayMap[uid] ?? 0) + o.points;
      }
    }

    const pendingToday = await prisma.taskOccurrence.count({
      where: {
        status: "PENDING",
        date: { gte: todayStart, lte: todayEnd },
        task: { householdId: h.id },
      },
    });

    const rows = h.users.map((u) => ({
      name: u.name,
      color: u.color,
      today: todayMap[u.id] ?? 0,
      week: weekMap[u.id] ?? 0,
      total: totalMap[u.id] ?? 0,
    }));

    for (const u of h.users) {
      if (!u.dailyDigest) continue;
      const already = await prisma.notificationLog.findUnique({
        where: {
          userId_type_forDate: {
            userId: u.id,
            type: "daily_digest",
            forDate: todayKey,
          },
        },
      });
      if (already) continue;

      const { subject, html } = dailyDigestEmail({
        recipientName: u.name,
        rows,
        pendingToday,
      });
      await sendEmail({ to: u.email, subject, html });
      await prisma.notificationLog.create({
        data: { userId: u.id, type: "daily_digest", forDate: todayKey },
      });
      emails++;
    }
  }

  return { households: households.length, emails, occurrencesTasks };
}
