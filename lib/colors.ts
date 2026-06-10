/** Palette used when creating new members. */
export const MEMBER_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
];

export function nextColor(usedColors: string[]): string {
  const free = MEMBER_COLORS.find((c) => !usedColors.includes(c));
  return free ?? MEMBER_COLORS[usedColors.length % MEMBER_COLORS.length];
}

/** Common IANA timezones for the settings picker. */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];
