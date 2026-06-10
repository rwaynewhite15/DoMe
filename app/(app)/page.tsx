import { requireUser } from "@/lib/auth";
import {
  getBudgets,
  getMembers,
  getOccurrencesInRange,
} from "@/lib/queries";
import {
  endOfLocalDay,
  localDayKey,
  localDayLabel,
  startOfLocalDay,
} from "@/lib/dates";
import { Board, type DayGroup } from "@/components/Board";
import { BudgetMeters } from "@/components/BudgetMeter";
import { SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const tz = user.household.timezone;
  const hid = user.householdId;
  const now = new Date();

  const [members, budgets, occurrences] = await Promise.all([
    getMembers(hid),
    getBudgets(hid, tz),
    getOccurrencesInRange(
      hid,
      startOfLocalDay(now, tz),
      endOfLocalDay(now, tz),
      tz,
    ),
  ]);

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

      <section>
        <SectionTitle>Weekly point budgets</SectionTitle>
        <BudgetMeters budgets={budgets} />
      </section>

      <section>
        <SectionTitle>Today&apos;s plan</SectionTitle>
        <Board
          days={[today]}
          members={members}
          currentUserId={user.id}
          defaultDate={localDayKey(now, tz)}
        />
      </section>
    </div>
  );
}
