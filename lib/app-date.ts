const APP_TIME_ZONE = "America/Sao_Paulo";

export function appDate(value = new Date(), dayOffset = 0) {
  const shifted = new Date(value.getTime() + dayOffset * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function appTimeMinutes(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part("hour") * 60 + part("minute");
}

export function appMonth(value = appDate()) {
  return value.slice(0, 7);
}

export function appMonthStart(value = appDate()) {
  return `${appMonth(value)}-01`;
}

export function shiftAppMonth(value = appDate(), offset = 0) {
  const [year, month] = appMonth(value).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function appMonthPeriod(monthValue = appMonth(), currentDate = appDate()) {
  const month = /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : appMonth(currentDate);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return {
    start: `${month}-01`,
    end: month === appMonth(currentDate) ? currentDate : `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function nextMonthDueDate(value = appDate(), day?: number) {
  const targetMonth = shiftAppMonth(value, 1);
  const [targetYear, targetMonthNumber] = targetMonth.split("-").map(Number);
  const sourceDay = Number(value.slice(8, 10));
  const requestedDay = Number.isInteger(day) ? Number(day) : sourceDay;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthNumber, 0, 12)).getUTCDate();
  const dueDay = Math.min(lastDay, Math.max(1, requestedDay));
  return `${targetMonth}-${String(dueDay).padStart(2, "0")}`;
}

export function appMonthLabel(value = appDate()) {
  const [year, month] = appMonth(value).split("-").map(Number);
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[month - 1]} ${year}`;
}

export function appDaysUntil(targetDate: string, currentDate = appDate()) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return timestamp;
  };
  const target = parse(targetDate);
  const current = parse(currentDate);
  if (target === null || current === null) return null;
  return Math.round((target - current) / 86400000);
}

export function membershipRenewalDates(dueDate: string, currentDate = appDate()) {
  const validDueDate = appDaysUntil(dueDate, currentDate) !== null;
  const referenceDate = validDueDate && dueDate > currentDate ? dueDate : currentDate;
  const billingDay = validDueDate ? Number(dueDate.slice(8, 10)) : Number(currentDate.slice(8, 10));
  return {
    paidMonth: appMonth(referenceDate),
    dueDate: nextMonthDueDate(referenceDate, billingDay),
  };
}
