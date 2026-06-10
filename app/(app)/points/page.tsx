import { requireUser } from "@/lib/auth";
import { getLeaderboard, getTrend } from "@/lib/points";
import { getBudgets } from "@/lib/queries";
import { PointsChart } from "@/components/PointsChart";
import { BudgetMeters } from "@/components/BudgetMeter";
import { Avatar, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PointsPage() {
  const user = await requireUser();
  const tz = user.household.timezone;
  const hid = user.householdId;

  const [trend, leaderboard, budgets] = await Promise.all([
    getTrend(hid, tz, 30),
    getLeaderboard(hid),
    getBudgets(hid, tz),
  ]);

  const ranked = [...leaderboard].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Points</h1>
        <p className="text-sm text-muted">Last 30 days</p>
      </div>

      <section>
        <SectionTitle>Leaderboard</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {ranked.map(({ member, total }, i) => (
            <div key={member.id} className="card flex items-center gap-3 p-4">
              <Avatar name={member.name} color={member.color} size={40} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-800">
                  {member.name}
                </div>
                <div className="text-2xl font-extrabold tabular-nums">
                  {total}
                  <span className="ml-1 text-xs font-medium text-muted">
                    pts
                  </span>
                </div>
              </div>
              {i === 0 && total > 0 && (
                <span className="ml-auto text-2xl" title="Leader">
                  🏆
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Trend</SectionTitle>
        <PointsChart
          daily={trend.daily}
          cumulative={trend.cumulative}
          members={trend.members}
        />
      </section>

      <section>
        <SectionTitle>This week&apos;s budgets</SectionTitle>
        <BudgetMeters budgets={budgets} />
      </section>
    </div>
  );
}
