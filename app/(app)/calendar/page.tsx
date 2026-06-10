import Link from "next/link";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { getMembers, getOccurrencesInRange } from "@/lib/queries";
import {
  endOfLocalDay,
  localDayKey,
  localDayLabel,
  weekDays,
} from "@/lib/dates";
import { Board, type DayGroup } from "@/components/Board";
import { ChevronLeft, ChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const user = await requireUser();
  const tz = user.household.timezone;
  const hid = user.householdId;
  const now = new Date();

  const { w } = await searchParams;
  const offset = Number.parseInt(w ?? "0", 10) || 0;
  const anchor = addDays(now, offset * 7);

  const dayStarts = weekDays(tz, anchor);
  const rangeStart = dayStarts[0];
  const rangeEnd = endOfLocalDay(dayStarts[6], tz);

  const [members, occurrences] = await Promise.all([
    getMembers(hid),
    getOccurrencesInRange(hid, rangeStart, rangeEnd, tz),
  ]);

  const todayKey = localDayKey(now, tz);
  const days: DayGroup[] = dayStarts.map((d) => {
    const key = localDayKey(d, tz);
    return {
      key,
      label: localDayLabel(d, tz),
      isToday: key === todayKey,
      occurrences: occurrences.filter(
        (o) => localDayKey(new Date(o.dateISO), tz) === key,
      ),
    };
  });

  const rangeLabel = `${formatInTimeZone(rangeStart, tz, "MMM d")} – ${formatInTimeZone(
    dayStarts[6],
    tz,
    "MMM d",
  )}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/calendar?w=${offset - 1}`}
            className="btn-ghost h-9 w-9 p-0"
            aria-label="Previous week"
          >
            <ChevronLeft width={18} height={18} />
          </Link>
          {offset !== 0 && (
            <Link href="/calendar" className="btn-ghost px-3 py-2 text-xs">
              Today
            </Link>
          )}
          <Link
            href={`/calendar?w=${offset + 1}`}
            className="btn-ghost h-9 w-9 p-0"
            aria-label="Next week"
          >
            <ChevronRight width={18} height={18} />
          </Link>
        </div>
      </div>

      <Board
        days={days}
        members={members}
        currentUserId={user.id}
        defaultDate={todayKey}
      />
    </div>
  );
}
