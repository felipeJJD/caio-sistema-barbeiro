import { bookingWeekday, serializeBookingWeekdays } from "./booking-weekdays";

export type BookingDayHours = {
  day: number;
  enabled: boolean;
  openingTime: string;
  closingTime: string;
};

export type WeeklyBookingHours = BookingDayHours[];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTime(value: string) {
  return timePattern.test(value);
}

export function fallbackWeeklyBookingHours(
  weekdays: readonly number[],
  openingTime = "08:00",
  closingTime = "19:00",
): WeeklyBookingHours {
  const normalizedOpening = validTime(openingTime) ? openingTime : "08:00";
  const normalizedClosing = validTime(closingTime) && closingTime > normalizedOpening ? closingTime : "19:00";
  const enabledDays = new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: enabledDays.has(day),
    openingTime: normalizedOpening,
    closingTime: normalizedClosing,
  }));
}

export function normalizeWeeklyBookingHours(
  value: unknown,
  fallbackWeekdays: readonly number[],
  fallbackOpeningTime = "08:00",
  fallbackClosingTime = "19:00",
): WeeklyBookingHours {
  const fallback = fallbackWeeklyBookingHours(fallbackWeekdays, fallbackOpeningTime, fallbackClosingTime);
  if (!Array.isArray(value)) return fallback;

  const rows = new Map<number, BookingDayHours>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<BookingDayHours>;
    const day = Number(candidate.day);
    const openingTime = String(candidate.openingTime ?? "");
    const closingTime = String(candidate.closingTime ?? "");
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!validTime(openingTime) || !validTime(closingTime) || openingTime >= closingTime) continue;
    rows.set(day, { day, enabled: Boolean(candidate.enabled), openingTime, closingTime });
  }
  if (rows.size !== 7) return fallback;
  const normalized = Array.from({ length: 7 }, (_, day) => rows.get(day)!);
  if (!normalized.some((row) => row.enabled)) return fallback;
  return normalized;
}

export function parseWeeklyBookingHours(
  serialized: string | null | undefined,
  fallbackWeekdays: readonly number[],
  fallbackOpeningTime = "08:00",
  fallbackClosingTime = "19:00",
): WeeklyBookingHours {
  if (!serialized) return fallbackWeeklyBookingHours(fallbackWeekdays, fallbackOpeningTime, fallbackClosingTime);
  try {
    return normalizeWeeklyBookingHours(JSON.parse(serialized), fallbackWeekdays, fallbackOpeningTime, fallbackClosingTime);
  } catch {
    return fallbackWeeklyBookingHours(fallbackWeekdays, fallbackOpeningTime, fallbackClosingTime);
  }
}

export function serializeWeeklyBookingHours(hours: WeeklyBookingHours) {
  const normalized = normalizeWeeklyBookingHours(hours, [], "08:00", "19:00");
  if (!normalized.some((row) => row.enabled)) throw new Error("Escolha pelo menos um dia de atendimento.");
  return JSON.stringify(normalized);
}

export function bookingWeekdaysFromHours(hours: WeeklyBookingHours) {
  return hours.filter((row) => row.enabled).map((row) => row.day);
}

export function bookingWeekdaysTextFromHours(hours: WeeklyBookingHours) {
  return serializeBookingWeekdays(bookingWeekdaysFromHours(hours));
}

export function bookingHoursForDate(hours: WeeklyBookingHours, date: string) {
  const weekday = bookingWeekday(date);
  return weekday < 0 ? null : hours.find((row) => row.day === weekday) ?? null;
}
