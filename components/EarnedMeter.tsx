import type { EarnedDTO } from "@/lib/points";
import { Avatar, EmptyState } from "@/components/ui";

function EarnedMeter({ earned, max }: { earned: EarnedDTO; max: number }) {
  const pct = max > 0 ? Math.round((earned.earned / max) * 100) : 0;
  return (
    <div className="card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={earned.member.name} color={earned.member.color} size={26} />
          <span className="text-sm font-semibold text-zinc-800">
            {earned.member.name}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-zinc-500">
          {earned.earned} pt{earned.earned === 1 ? "" : "s"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: earned.member.color }}
        />
      </div>
    </div>
  );
}

export function EarnedMeters({ earned }: { earned: EarnedDTO[] }) {
  const total = earned.reduce((sum, e) => sum + e.earned, 0);
  if (total === 0) {
    return <EmptyState>No points earned yet today. Check off a task to start.</EmptyState>;
  }
  // Bars are sized relative to the day's top earner.
  const max = Math.max(...earned.map((e) => e.earned));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {earned.map((e) => (
        <EarnedMeter key={e.member.id} earned={e} max={max} />
      ))}
    </div>
  );
}
