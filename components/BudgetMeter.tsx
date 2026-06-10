import type { BudgetDTO } from "@/lib/queries";
import { Avatar } from "@/components/ui";

export function BudgetMeter({ budget }: { budget: BudgetDTO }) {
  const pct = Math.min(100, Math.round((budget.used / budget.max) * 100));
  const over = budget.used > budget.max;
  return (
    <div className="card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={budget.member.name} color={budget.member.color} size={26} />
          <span className="text-sm font-semibold text-zinc-800">
            {budget.member.name}
          </span>
        </div>
        <span
          className={`text-sm font-semibold tabular-nums ${
            over ? "text-red-600" : "text-zinc-500"
          }`}
        >
          {budget.used}/{budget.max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: over ? "#dc2626" : budget.member.color,
          }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {budget.remaining} of {budget.max} points left to assign this week
      </p>
    </div>
  );
}

export function BudgetMeters({ budgets }: { budgets: BudgetDTO[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {budgets.map((b) => (
        <BudgetMeter key={b.member.id} budget={b} />
      ))}
    </div>
  );
}
