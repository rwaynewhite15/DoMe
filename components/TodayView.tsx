"use client";

import {
  BoardCanvas,
  OccurrencesProvider,
  flattenDays,
  useOccurrenceStore,
  type DayGroup,
} from "@/components/Board";
import { EarnedMeters } from "@/components/EarnedMeter";
import { SectionTitle } from "@/components/ui";
import type { EarnedDTO } from "@/lib/points";
import type { MemberDTO } from "@/lib/queries";

/**
 * Home page body. Wraps the points meters and the board in one optimistic store
 * so checking off a task (or editing its points/quantity) moves the "earned
 * today" bars and the day counter instantly, before the server round-trip.
 */
export function TodayView({
  today,
  members,
  currentUserId,
  defaultDate,
  earned,
}: {
  today: DayGroup;
  members: MemberDTO[];
  currentUserId: string;
  defaultDate: string;
  earned: EarnedDTO[];
}) {
  return (
    <OccurrencesProvider
      days={[today]}
      members={members}
      currentUserId={currentUserId}
    >
      <section>
        <SectionTitle>Points earned today</SectionTitle>
        <LiveEarnedMeters earned={earned} />
      </section>

      <section>
        <SectionTitle action={<LiveCounter />}>Today&apos;s plan</SectionTitle>
        <BoardCanvas defaultDate={defaultDate} />
      </section>
    </OccurrencesProvider>
  );
}

/** Sum completed points per credited member (assignee, else completer). */
function creditedTotals(
  items: ReturnType<typeof flattenDays>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const o of items) {
    if (o.status !== "COMPLETED") continue;
    const uid = o.assignee?.id ?? o.completedById;
    if (!uid) continue;
    totals[uid] = (totals[uid] ?? 0) + o.points;
  }
  return totals;
}

/**
 * The "Points earned today" bars, adjusted live. Starts from the server totals
 * and applies the difference between the optimistic and base board state, so
 * server-only contributions (e.g. completions on now-inactive tasks) are
 * preserved while edits on screen show immediately.
 */
function LiveEarnedMeters({ earned }: { earned: EarnedDTO[] }) {
  const { days, baseDays } = useOccurrenceStore();
  const opt = creditedTotals(flattenDays(days));
  const base = creditedTotals(flattenDays(baseDays));
  const adjusted = earned.map((e) => ({
    ...e,
    earned: Math.max(0, e.earned + (opt[e.member.id] ?? 0) - (base[e.member.id] ?? 0)),
  }));
  return <EarnedMeters earned={adjusted} />;
}

/** The "earned / scheduled pts today" counter, derived from the live board. */
function LiveCounter() {
  const { days } = useOccurrenceStore();
  const items = flattenDays(days);
  const scheduled = items
    .filter((o) => o.status !== "SKIPPED")
    .reduce((sum, o) => sum + o.points, 0);
  const earned = items
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + o.points, 0);
  return (
    <span className="text-sm font-semibold tabular-nums text-zinc-700">
      {earned}
      <span className="font-medium text-muted">/{scheduled} pts today</span>
    </span>
  );
}
