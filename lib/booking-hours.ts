export type BookingDayHours = {
  day: number;
  enabled: boolean;
  openingTime: string;
  closingTime: string;
};

export type WeeklyBookingHours = BookingDayHours[];

function bookingWeekday(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return -1;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return -1;
  return date.getUTCDay();
}

function serializeBookingWeekdays(days: readonly number[]) {
  return [...new Set(days)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .join(",");
}

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


export function normalizeTeamWeeklyBookingHours(value: unknown, fallbackHours: WeeklyBookingHours): WeeklyBookingHours {
  if (!Array.isArray(value)) return fallbackHours.map((row) => ({ ...row }));
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
  if (rows.size !== 7) return fallbackHours.map((row) => ({ ...row }));
  return Array.from({ length: 7 }, (_, day) => rows.get(day)!);
}

export function parseTeamWeeklyBookingHours(serialized: string | null | undefined, fallbackHours: WeeklyBookingHours): WeeklyBookingHours {
  if (!serialized) return fallbackHours.map((row) => ({ ...row }));
  try {
    return normalizeTeamWeeklyBookingHours(JSON.parse(serialized), fallbackHours);
  } catch {
    return fallbackHours.map((row) => ({ ...row }));
  }
}

export function serializeTeamWeeklyBookingHours(hours: WeeklyBookingHours) {
  const fallback = fallbackWeeklyBookingHours([], "08:00", "19:00");
  const normalized = normalizeTeamWeeklyBookingHours(hours, fallback);
  if (normalized.length !== 7) throw new Error("Informe os horários do profissional.");
  return JSON.stringify(normalized);
}

export function teamBookingHoursForDate(teamHours: WeeklyBookingHours, date: string) {
  return bookingHoursForDate(teamHours, date);
}

export function bookingWindowAllows(dayHours: BookingDayHours | null | undefined, startMinutes: number, durationMinutes: number) {
  if (!dayHours?.enabled) return false;
  const opening = Number(dayHours.openingTime.slice(0, 2)) * 60 + Number(dayHours.openingTime.slice(3, 5));
  const closing = Number(dayHours.closingTime.slice(0, 2)) * 60 + Number(dayHours.closingTime.slice(3, 5));
  return Number.isFinite(opening) && Number.isFinite(closing) && startMinutes >= opening && startMinutes + durationMinutes <= closing;
}
