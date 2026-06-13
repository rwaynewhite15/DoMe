import { requireUser } from "@/lib/auth";
import {
  getCarryoverOccurrences,
  getMembers,
  getOccurrencesInRange,
} from "@/lib/queries";
import { getDailyEarned } from "@/lib/points";
import {
  endOfLocalDay,
  localDayKey,
  localDayLabel,
  startOfLocalDay,
} from "@/lib/dates";
import { type DayGroup } from "@/components/Board";
import { TodayView } from "@/components/TodayView";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const tz = user.household.timezone;
  const hid = user.householdId;
  const now = new Date();

  const dayStart = startOfLocalDay(now, tz);
  const [members, earned, todayOccurrences, carryovers] = await Promise.all([
    getMembers(hid),
    getDailyEarned(hid, tz),
    getOccurrencesInRange(hid, dayStart, endOfLocalDay(now, tz), tz),
    // "Keep until done" tasks left unfinished from earlier days surface here.
    getCarryoverOccurrences(hid, dayStart, tz),
  ]);

  // Overdue carry-overs lead today's list so they're not forgotten.
  const occurrences = [...carryovers, ...todayOccurrences];

  const today: DayGroup = {
    key: localDayKey(now, tz),
    label: localDayLabel(now, tz),
    isToday: true,
    occurrences,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Hi {user.name.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-muted">Here&apos;s your day.</p>
      </div>

      <TodayView
        today={today}
        members={members}
        currentUserId={user.id}
        defaultDate={localDayKey(now, tz)}
        earned={earned}
      />
    </div>
  );
}
