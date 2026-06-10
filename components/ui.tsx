import type { CSSProperties, ReactNode } from "react";

export function Avatar({
  name,
  color,
  size = 32,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const style: CSSProperties = {
    background: color,
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
  };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={style}
      title={name}
    >
      {initials}
    </span>
  );
}

/** Avatar for a task's assignee, or a dashed "Anyone" marker when unassigned. */
export function AssigneeAvatar({
  member,
  size = 26,
}: {
  member: { name: string; color: string } | null;
  size?: number;
}) {
  if (member) return <Avatar name={member.name} color={member.color} size={size} />;
  return (
    <span
      title="Anyone"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 font-semibold text-zinc-400"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      Any
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

export function PointsBadge({
  points,
  muted = false,
}: {
  points: number;
  muted?: boolean;
}) {
  if (points <= 0) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
        muted ? "bg-zinc-100 text-zinc-500" : "bg-indigo-50 text-indigo-700"
      }`}
    >
      {points} pt{points === 1 ? "" : "s"}
    </span>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold text-zinc-800">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white/50 px-4 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}
