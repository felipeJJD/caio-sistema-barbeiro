export type BusinessInsightAttendance = {
  occurredAt: string;
  clientName: string;
  quantity: number;
  valueCents: number;
  tipCents: number;
  serviceName: string;
  barberName: string;
};

export type BusinessInsightAppointment = {
  appointmentDate: string;
  clientName: string;
  phone: string;
};

export type BusinessInsightMembershipClient = {
  name: string;
  phone: string;
};

export type BusinessInsightMoneyEvent = {
  occurredAt: string;
  valueCents: number;
};

export type DormantClientInsight = {
  key: string;
  name: string;
  phone: string;
  whatsappReady: boolean;
  lastVisit: string;
  daysAway: number;
  cadenceDays: number | null;
  expectedReturnDays: number;
  overdueDays: number;
  visitCount: number;
  lastService: string;
  lastBarber: string;
  estimatedValueCents: number;
  bucket: "30-44" | "45-59" | "60+";
};

export type FinanceMonthInsight = {
  month: string;
  label: string;
  totalRevenueCents: number;
  attendanceCount: number;
  dailyRevenue: Array<{ day: number; valueCents: number }>;
  weekdays: Array<{ weekday: number; label: string; count: number }>;
};

export type BusinessInsights = {
  generatedAt: string;
  dormant: {
    total: number;
    buckets: { days30to44: number; days45to59: number; days60plus: number };
    estimatedValueCents: number;
    clients: DormantClientInsight[];
  };
  financeMonths: FinanceMonthInsight[];
};

const dayMs = 86_400_000;
const monthLabels = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

function monthOf(value: string) {
  return /^\d{4}-\d{2}(?:-\d{2})?$/.test(value) ? value.slice(0, 7) : "";
}

function shiftMonth(value: string, offset: number) {
  const month = monthOf(value);
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const month = monthOf(value);
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthLabels[monthNumber - 1] ?? "mês"} ${year}`;
}

function dateStamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 12);
}

function daysBetween(start: string, end: string) {
  const startStamp = dateStamp(start);
  const endStamp = dateStamp(end);
  if (!Number.isFinite(startStamp) || !Number.isFinite(endStamp)) return 0;
  return Math.max(0, Math.round((endStamp - startStamp) / dayMs));
}

function normalizeClientKey(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function usefulClientName(value: string) {
  const key = normalizeClientKey(value);
  return key.length >= 2
    && key !== "cliente"
    && key !== "cliente nao informado"
    && key !== "nao informado"
    && !/^teste\b/.test(key);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function whatsappReady(value: string) {
  const digits = phoneDigits(value);
  return digits.length >= 10 && digits.length <= 13;
}

export function buildDormantClients(input: {
  attendances: BusinessInsightAttendance[];
  appointments: BusinessInsightAppointment[];
  membershipClients: BusinessInsightMembershipClient[];
  today: string;
}) {
  const phoneByClient = new Map<string, { phone: string; date: string }>();
  for (const appointment of input.appointments) {
    const key = normalizeClientKey(appointment.clientName);
    if (!key || !appointment.phone.trim()) continue;
    const current = phoneByClient.get(key);
    if (!current || appointment.appointmentDate >= current.date) {
      phoneByClient.set(key, { phone: appointment.phone.trim(), date: appointment.appointmentDate });
    }
  }
  for (const client of input.membershipClients) {
    const key = normalizeClientKey(client.name);
    if (!key || !client.phone.trim()) continue;
    const current = phoneByClient.get(key);
    if (!current || !current.phone) phoneByClient.set(key, { phone: client.phone.trim(), date: input.today });
  }

  const groups = new Map<string, BusinessInsightAttendance[]>();
  for (const attendance of input.attendances) {
    if (!usefulClientName(attendance.clientName)) continue;
    const key = normalizeClientKey(attendance.clientName);
    const rows = groups.get(key) ?? [];
    rows.push(attendance);
    groups.set(key, rows);
  }

  const result: DormantClientInsight[] = [];
  for (const [key, rows] of groups) {
    const sorted = rows.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const uniqueDates = [...new Set(sorted.map((row) => row.occurredAt))].sort();
    const last = sorted[sorted.length - 1];
    const daysAway = daysBetween(last.occurredAt, input.today);
    const gaps = uniqueDates.slice(1).map((value, index) => daysBetween(uniqueDates[index], value)).filter((value) => value > 0 && value <= 120).slice(-6);
    const cadenceDays = median(gaps);
    const expectedReturnDays = cadenceDays === null
      ? 60
      : Math.max(30, Math.min(75, Math.round(cadenceDays * 1.5)));
    if (daysAway < expectedReturnDays) continue;

    const phone = phoneByClient.get(key)?.phone ?? "";
    result.push({
      key,
      name: last.clientName.trim(),
      phone,
      whatsappReady: whatsappReady(phone),
      lastVisit: last.occurredAt,
      daysAway,
      cadenceDays,
      expectedReturnDays,
      overdueDays: Math.max(0, daysAway - expectedReturnDays),
      visitCount: uniqueDates.length,
      lastService: last.serviceName,
      lastBarber: last.barberName,
      estimatedValueCents: Math.max(0, Number(last.valueCents || 0) + Number(last.tipCents || 0)),
      bucket: daysAway >= 60 ? "60+" : daysAway >= 45 ? "45-59" : "30-44",
    });
  }

  return result.sort((a, b) =>
    Number(b.whatsappReady) - Number(a.whatsappReady)
    || b.overdueDays - a.overdueDays
    || b.visitCount - a.visitCount
    || b.daysAway - a.daysAway,
  );
}

function monthDays(month: string, today: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return month === monthOf(today) ? Math.min(lastDay, Number(today.slice(8, 10))) : lastDay;
}

function eventMonth(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : "";
}

function weekdayForDate(value: string) {
  const stamp = dateStamp(value);
  return Number.isFinite(stamp) ? new Date(stamp).getUTCDay() : 0;
}

export function buildFinanceMonths(input: {
  attendances: BusinessInsightAttendance[];
  membershipPayments: BusinessInsightMoneyEvent[];
  productSales: BusinessInsightMoneyEvent[];
  today: string;
  monthCount?: number;
}) {
  const count = Math.max(1, Math.min(18, Math.round(input.monthCount ?? 12)));
  const months = Array.from({ length: count }, (_, index) => shiftMonth(input.today, -index));
  const monthSet = new Set(months);
  const revenueByMonth = new Map<string, Map<number, number>>();
  const visitsByMonth = new Map<string, number[]>();
  const totalByMonth = new Map<string, number>();

  for (const month of months) {
    revenueByMonth.set(month, new Map());
    visitsByMonth.set(month, Array(7).fill(0));
    totalByMonth.set(month, 0);
  }

  const addRevenue = (occurredAt: string, valueCents: number) => {
    const month = eventMonth(occurredAt);
    if (!monthSet.has(month)) return;
    const day = Number(occurredAt.slice(8, 10));
    const daily = revenueByMonth.get(month)!;
    daily.set(day, (daily.get(day) ?? 0) + Math.max(0, Number(valueCents || 0)));
    totalByMonth.set(month, (totalByMonth.get(month) ?? 0) + Math.max(0, Number(valueCents || 0)));
  };

  for (const attendance of input.attendances) {
    const month = eventMonth(attendance.occurredAt);
    if (!monthSet.has(month)) continue;
    addRevenue(attendance.occurredAt, Number(attendance.valueCents || 0) + Number(attendance.tipCents || 0));
    const weekday = weekdayForDate(attendance.occurredAt);
    const visits = visitsByMonth.get(month)!;
    visits[weekday] += Math.max(1, Number(attendance.quantity || 1));
  }
  for (const payment of input.membershipPayments) addRevenue(payment.occurredAt, payment.valueCents);
  for (const sale of input.productSales) addRevenue(sale.occurredAt, sale.valueCents);

  return months.map((month) => {
    const daily = revenueByMonth.get(month)!;
    const visits = visitsByMonth.get(month)!;
    return {
      month,
      label: monthLabel(`${month}-01`),
      totalRevenueCents: totalByMonth.get(month) ?? 0,
      attendanceCount: visits.reduce((sum, value) => sum + value, 0),
      dailyRevenue: Array.from({ length: monthDays(month, input.today) }, (_, index) => ({
        day: index + 1,
        valueCents: daily.get(index + 1) ?? 0,
      })),
      weekdays: weekdayOrder.map((weekday) => ({ weekday, label: weekdayLabels[weekday], count: visits[weekday] ?? 0 })),
    } satisfies FinanceMonthInsight;
  });
}
