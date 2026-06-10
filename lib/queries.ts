import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { localDayLabel, localTimeLabel } from "@/lib/dates";
import { WEEKLY_BUDGET, getWeeklyUsage } from "@/lib/budget";
import { parseRRuleString } from "@/lib/recurrence";
import type { TaskFormInitial } from "@/components/TaskForm";

export interface MemberDTO {
  id: string;
  name: string;
  color: string;
}

export interface OccurrenceDTO {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  location: string | null;
  kind: "EVENT" | "TASK";
  points: number;
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  dateISO: string;
  dateLabel: string;
  timeLabel: string | null;
  allDay: boolean;
  isRecurring: boolean;
  pointsEdited: boolean;
  /** Task is flagged to stay on the list until it's completed. */
  rollover: boolean;
  /** This pending occurrence is overdue and surfaced on today via rollover. */
  carriedOver: boolean;
  assignee: MemberDTO | null;
  assigner: MemberDTO;
  completedByName: string | null;
  sortOrder: number;
  /** Pre-built form state for editing the underlying task from the board. */
  initial: TaskFormInitial;
}

export interface BudgetDTO {
  member: MemberDTO;
  used: number;
  remaining: number;
  max: number;
}

const occurrenceInclude = {
  task: {
    include: {
      assignee: { select: { id: true, name: true, color: true } },
      assigner: { select: { id: true, name: true, color: true } },
    },
  },
  completedBy: { select: { name: true } },
} as const;

type OccurrenceRow = Awaited<
  ReturnType<typeof fetchOccurrences>
>[number];

function fetchOccurrences(householdId: string, start: Date, end: Date) {
  return prisma.taskOccurrence.findMany({
    where: {
      date: { gte: start, lte: end },
      task: { householdId, active: true },
    },
    include: occurrenceInclude,
    orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
  });
}

/**
 * Build the TaskForm's initial state from a task row. Shared by the manage
 * list and the calendar/today board so an item can be edited from anywhere.
 */
function buildTaskInitial(
  t: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    kind: "EVENT" | "TASK";
    assignerId: string;
    assigneeId: string | null;
    defaultPoints: number;
    startAt: Date;
    allDay: boolean;
    isRecurring: boolean;
    recurrenceRule: string | null;
    rollover: boolean;
  },
  tz: string,
): TaskFormInitial {
  const rec = parseRRuleString(t.recurrenceRule);
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    location: t.location ?? "",
    kind: t.kind,
    assignerId: t.assignerId,
    assigneeId: t.assigneeId ?? "",
    defaultPoints: t.defaultPoints,
    date: formatInTimeZone(t.startAt, tz, "yyyy-MM-dd"),
    time: formatInTimeZone(t.startAt, tz, "HH:mm"),
    allDay: t.allDay,
    rollover: t.rollover,
    freq: rec.freq,
    interval: rec.interval ?? 1,
    weekdays: rec.weekdays ?? [],
    isRecurring: t.isRecurring,
  };
}

function toDTO(o: OccurrenceRow, tz: string): OccurrenceDTO {
  return {
    id: o.id,
    taskId: o.taskId,
    title: o.task.title,
    description: o.task.description,
    location: o.task.location,
    kind: o.task.kind,
    points: o.points,
    status: o.status,
    dateISO: o.date.toISOString(),
    dateLabel: localDayLabel(o.date, tz),
    // Tasks are date-only; only timed events carry a clock label.
    timeLabel:
      o.task.kind === "TASK" || o.task.allDay
        ? null
        : localTimeLabel(o.date, tz),
    allDay: o.task.allDay,
    isRecurring: o.task.isRecurring,
    pointsEdited: o.pointsEdited,
    rollover: o.task.rollover,
    carriedOver: false,
    assignee: o.task.assignee ?? null,
    assigner: o.task.assigner,
    completedByName: o.completedBy?.name ?? null,
    sortOrder: o.sortOrder,
    initial: buildTaskInitial(o.task, tz),
  };
}

export async function getOccurrencesInRange(
  householdId: string,
  start: Date,
  end: Date,
  tz: string,
): Promise<OccurrenceDTO[]> {
  const rows = await fetchOccurrences(householdId, start, end);
  return rows.map((r) => toDTO(r, tz));
}

/**
 * Overdue, still-pending occurrences of "keep until done" (rollover) tasks.
 * These are surfaced on today's list so the task follows you forward until it's
 * completed — without spending budget on a new occurrence each day.
 */
export async function getCarryoverOccurrences(
  householdId: string,
  before: Date,
  tz: string,
): Promise<OccurrenceDTO[]> {
  const rows = await prisma.taskOccurrence.findMany({
    where: {
      date: { lt: before },
      status: "PENDING",
      task: { householdId, active: true, rollover: true, isRecurring: false },
    },
    include: occurrenceInclude,
    orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map((r) => ({ ...toDTO(r, tz), carriedOver: true }));
}

export async function getMembers(householdId: string): Promise<MemberDTO[]> {
  return prisma.user.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface TaskListItemDTO {
  id: string;
  title: string;
  kind: "EVENT" | "TASK";
  defaultPoints: number;
  active: boolean;
  assignee: MemberDTO | null;
  assigner: MemberDTO;
  scheduleLabel: string;
  initial: TaskFormInitial;
}

function recurrenceLabel(
  freq: TaskFormInitial["freq"],
  interval: number,
  weekdays: number[],
): string {
  const every = interval > 1 ? `${interval} ` : "";
  switch (freq) {
    case "DAILY":
      return `Every ${every}day${interval > 1 ? "s" : ""}`;
    case "WEEKLY": {
      const days =
        weekdays.length > 0
          ? " on " + weekdays.map((d) => WEEKDAY_NAMES[d]).join(", ")
          : "";
      return `Every ${every}week${interval > 1 ? "s" : ""}${days}`;
    }
    case "MONTHLY":
      return `Every ${every}month${interval > 1 ? "s" : ""}`;
    default:
      return "Does not repeat";
  }
}

export async function getTasksForManage(
  householdId: string,
  tz: string,
): Promise<TaskListItemDTO[]> {
  const tasks = await prisma.task.findMany({
    where: { householdId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { id: true, name: true, color: true } },
      assigner: { select: { id: true, name: true, color: true } },
    },
  });

  return tasks.map((t) => {
    const rec = parseRRuleString(t.recurrenceRule);
    // Tasks are date-only; only events show a time (or "All day").
    const timePart =
      t.kind === "TASK" ? null : t.allDay ? "All day" : localTimeLabel(t.startAt, tz);
    const base = t.isRecurring
      ? recurrenceLabel(rec.freq, rec.interval ?? 1, rec.weekdays ?? [])
      : localDayLabel(t.startAt, tz);
    let scheduleLabel = timePart ? `${base} · ${timePart}` : base;
    if (t.rollover) scheduleLabel += " · Keeps until done";

    const initial = buildTaskInitial(t, tz);

    return {
      id: t.id,
      title: t.title,
      kind: t.kind,
      defaultPoints: t.defaultPoints,
      active: t.active,
      assignee: t.assignee,
      assigner: t.assigner,
      scheduleLabel,
      initial,
    };
  });
}

export async function getBudgets(
  householdId: string,
  tz: string,
): Promise<BudgetDTO[]> {
  const members = await getMembers(householdId);
  const result: BudgetDTO[] = [];
  for (const member of members) {
    const used = await getWeeklyUsage(member.id, tz);
    result.push({
      member,
      used,
      remaining: Math.max(0, WEEKLY_BUDGET - used),
      max: WEEKLY_BUDGET,
    });
  }
  return result;
}
