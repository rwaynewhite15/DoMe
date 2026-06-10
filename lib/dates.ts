import { addDays, endOfDay, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_TZ = "America/Denver";

/** Current instant as a Date whose wall-clock fields are in the given tz. */
export function nowInTz(tz: string): Date {
  return toZonedTime(new Date(), tz);
}

/** UTC instant for the start (00:00) of the local day containing `instant` in tz. */
export function startOfLocalDay(instant: Date, tz: string): Date {
  const local = toZonedTime(instant, tz);
  return fromZonedTime(startOfDay(local), tz);
}

/** UTC instant for the end (23:59:59.999) of the local day containing `instant` in tz. */
export function endOfLocalDay(instant: Date, tz: string): Date {
  const local = toZonedTime(instant, tz);
  return fromZonedTime(endOfDay(local), tz);
}

/**
 * Rolling weekly window: from the start of "today" (local) through the end of
 * today + 6 days (local). Returned as UTC instants for DB comparisons.
 */
export function weekWindow(
  tz: string,
  anchor: Date = new Date(),
): { start: Date; end: Date } {
  const local = toZonedTime(anchor, tz);
  const start = fromZonedTime(startOfDay(local), tz);
  const end = fromZonedTime(endOfDay(addDays(local, 6)), tz);
  return { start, end };
}

/** Local calendar-day key, e.g. "2026-06-09". */
export function localDayKey(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/** Human label like "Tue, Jun 9". */
export function localDayLabel(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "EEE, MMM d");
}

/** Time label like "9:30 AM". */
export function localTimeLabel(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "h:mm a");
}

/** Convert a local date (yyyy-MM-dd) + time (HH:mm) in tz to a UTC instant. */
export function localDateTimeToUtc(
  dateStr: string,
  timeStr: string | undefined,
  tz: string,
  allDay: boolean,
): Date {
  const time = allDay || !timeStr ? "00:00" : timeStr;
  return fromZonedTime(`${dateStr}T${time}:00`, tz);
}

/** List of 7 day-start instants beginning at the local start of `anchor`'s day. */
export function weekDays(tz: string, anchor: Date = new Date()): Date[] {
  const startLocal = toZonedTime(anchor, tz);
  const base = startOfDay(startLocal);
  return Array.from({ length: 7 }, (_, i) =>
    fromZonedTime(addDays(base, i), tz),
  );
}
