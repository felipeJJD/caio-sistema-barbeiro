export const BOOKING_WEEKDAY_OPTIONS = [
  { value: 0, shortLabel: "DOM", label: "Domingo" },
  { value: 1, shortLabel: "SEG", label: "Segunda" },
  { value: 2, shortLabel: "TER", label: "Terça" },
  { value: 3, shortLabel: "QUA", label: "Quarta" },
  { value: 4, shortLabel: "QUI", label: "Quinta" },
  { value: 5, shortLabel: "SEX", label: "Sexta" },
  { value: 6, shortLabel: "SÁB", label: "Sábado" },
] as const;

export const DEFAULT_PUBLIC_BOOKING_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;

export function serializeBookingWeekdays(days: readonly number[]) {
  return [...new Set(days)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .join(",");
}

export function parseBookingWeekdays(value: string | null | undefined) {
  const parsed = serializeBookingWeekdays(String(value ?? "").split(",").filter((day) => day.trim() !== "").map(Number));
  return (parsed || serializeBookingWeekdays(DEFAULT_PUBLIC_BOOKING_WEEKDAYS)).split(",").map(Number);
}

export function bookingWeekday(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return -1;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return -1;
  return date.getUTCDay();
}

export function isPublicBookingDateAllowed(value: string, weekdays: readonly number[]) {
  const weekday = bookingWeekday(value);
  return weekday >= 0 && weekdays.includes(weekday);
}
