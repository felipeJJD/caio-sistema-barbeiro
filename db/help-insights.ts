import type { AccessContext } from "./access";
import { appDate, shiftAppMonth } from "../lib/app-date";
import { normalizeHelp } from "../lib/help-guide";
import type { ReportRequest } from "../lib/help-reports";

type Access = Pick<AccessContext, "organizationId" | "teamMemberId" | "isOwner">;
type Result<T> = { success: boolean; results: T[] };
type Statement = { bind(...args: Array<string | number | null>): Statement; all<T>(): Promise<Result<T>> };
type Database = { prepare(sql: string): Statement };

type ClientVisit = { client_name: string; occurred_at: string };
type PaceRow = { occurred_at: string; value_cents: number; created_at: string };

export type ClientReturnOpportunity = {
  name: string;
  daysSince: number;
  usualDays: number | null;
  cameLastMonth: boolean;
  overdue: boolean;
};

async function database() {
  const { env } = await import("@/runtime/env");
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Dados indisponíveis.");
  return db;
}

function daysBetween(left: string, right: string) {
  return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / 86400000);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function properClientName(value: string) {
  const clean = normalizeHelp(value);
  return Boolean(clean) && !["cliente", "cliente nao informado", "nao informado", "sem nome", "avulso"].includes(clean);
}

export async function readClientReturnOpportunities(access: Access, now = new Date()) {
  const db = await database();
  const today = appDate(now);
  const start = appDate(now, -210);
  const memberId = access.isOwner ? null : access.teamMemberId;
  const rows = await db.prepare(`
    SELECT client_name, occurred_at
    FROM daily_records
    WHERE organization_id = ?
      AND occurred_at BETWEEN ? AND ?
      AND (? IS NULL OR barber_id = ?)
      AND trim(client_name) <> ''
    ORDER BY occurred_at ASC, id ASC
  `).bind(access.organizationId, start, today, memberId, memberId).all<ClientVisit>();
  if (!rows.success) throw new Error("Não consegui analisar o retorno dos clientes.");

  const grouped = new Map<string, { name: string; dates: string[] }>();
  for (const row of rows.results) {
    if (!properClientName(row.client_name)) continue;
    const key = normalizeHelp(row.client_name);
    const current = grouped.get(key) ?? { name: row.client_name.trim(), dates: [] };
    current.name = row.client_name.trim() || current.name;
    if (!current.dates.includes(row.occurred_at)) current.dates.push(row.occurred_at);
    grouped.set(key, current);
  }

  const currentMonth = today.slice(0, 7);
  const previousMonth = shiftAppMonth(today, -1).slice(0, 7);
  const opportunities: ClientReturnOpportunity[] = [];

  for (const client of grouped.values()) {
    const dates = client.dates.sort();
    const last = dates.at(-1);
    if (!last) continue;
    const daysSince = Math.max(0, daysBetween(last, today));
    const cameThisMonth = dates.some((date) => date.startsWith(currentMonth));
    const cameLastMonth = dates.some((date) => date.startsWith(previousMonth));

    const recentDates = dates.slice(-6);
    const intervals: number[] = [];
    for (let index = 1; index < recentDates.length; index++) {
      const interval = daysBetween(recentDates[index - 1], recentDates[index]);
      if (interval >= 3 && interval <= 90) intervals.push(interval);
    }
    const usualDays = intervals.length >= 2 ? Math.round(mean(intervals)) : null;
    const overdue = usualDays !== null && daysSince >= Math.max(usualDays + 3, Math.round(usualDays * 1.25));
    const missedMonth = cameLastMonth && !cameThisMonth;

    if (!overdue && !missedMonth) continue;
    opportunities.push({ name: client.name, daysSince, usualDays, cameLastMonth, overdue });
  }

  return opportunities
    .sort((left, right) => {
      const leftRatio = left.usualDays ? left.daysSince / left.usualDays : 1;
      const rightRatio = right.usualDays ? right.daysSince / right.usualDays : 1;
      if (right.overdue !== left.overdue) return Number(right.overdue) - Number(left.overdue);
      return rightRatio - leftRatio || right.daysSince - left.daysSince;
    })
    .slice(0, 20);
}

export function formatClientReturnReply(opportunities: ClientReturnOpportunity[]) {
  if (!opportunities.length) {
    return {
      answer: "Pelo histórico registrado, não encontrei ninguém claramente atrasado para voltar agora.",
      contextMessage: "[contexto seguro] Analisei clientes que podem estar na hora de voltar e não encontrei oportunidades claras.",
    };
  }
  const habitCount = opportunities.filter((item) => item.overdue && item.usualDays).length;
  const monthCount = opportunities.filter((item) => item.cameLastMonth).length;
  const headline = habitCount
    ? `Achei ${opportunities.length} cliente${opportunities.length === 1 ? "" : "s"} que vale a pena olhar. ${habitCount} já passaram do ritmo normal de retorno.`
    : `Achei ${opportunities.length} cliente${opportunities.length === 1 ? "" : "s"} que vieram recentemente e ainda não voltaram.`;
  const details = opportunities.map((item) => {
    if (item.overdue && item.usualDays) return `${item.name} — costuma voltar a cada ~${item.usualDays} dias e já está há ${item.daysSince} dias sem vir.`;
    if (item.cameLastMonth) return `${item.name} — veio no mês passado e ainda não apareceu neste mês.`;
    return `${item.name} — está há ${item.daysSince} dias sem vir.`;
  }).join("\n");
  return {
    answer: headline + (monthCount ? ` Também encontrei ${monthCount} que vieram no mês passado e ainda não vieram neste.` : ""),
    details: `${details}\nA comparação usa o nome escrito nos atendimentos; confira no Histórico se houver homônimos antes de entrar em contato.`,
    contextMessage: "[contexto seguro] Mostrei oportunidades de retorno de clientes com base no hábito e em quem veio no mês passado.",
  };
}

function localTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function createdAtLocalMinutes(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? localTimeParts(date) : null;
}

function createdAtLocalDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? appDate(date) : null;
}

const weekdayPlural = ["domingos", "segundas-feiras", "terças-feiras", "quartas-feiras", "quintas-feiras", "sextas-feiras", "sábados"];

export async function readDailyPaceInsight(access: Access, report: ReportRequest, now = new Date()) {
  if (report.metric !== "summary" || report.start !== report.end) return null;
  const db = await database();
  const requestedDay = report.start;
  const today = appDate(now);
  if (requestedDay > today) return null;
  const targetWeekday = new Date(`${requestedDay}T12:00:00Z`).getUTCDay();
  const historyStart = appDate(new Date(`${requestedDay}T12:00:00Z`), -49);
  const memberId = report.person || report.scope === "self" ? access.teamMemberId : null;

  // Named-person reports are resolved inside readHelpReport; without that resolved id
  // this helper stays conservative instead of comparing the wrong professional.
  if (report.person) return null;

  const rows = await db.prepare(`
    SELECT occurred_at, value_cents, created_at
    FROM daily_records
    WHERE organization_id = ?
      AND occurred_at BETWEEN ? AND ?
      AND (? IS NULL OR barber_id = ?)
    ORDER BY occurred_at ASC, id ASC
  `).bind(access.organizationId, historyStart, requestedDay, memberId, memberId).all<PaceRow>();
  if (!rows.success) return null;

  const currentCutoff = requestedDay === today ? localTimeParts(now) : null;
  let currentRevenue = 0;
  const history = new Map<string, number>();

  for (const row of rows.results) {
    if (row.occurred_at === requestedDay) {
      currentRevenue += Number(row.value_cents || 0);
      continue;
    }
    const weekday = new Date(`${row.occurred_at}T12:00:00Z`).getUTCDay();
    if (weekday !== targetWeekday) continue;
    if (currentCutoff !== null) {
      // Imported/backfilled records can have a creation timestamp unrelated to
      // their service date; skip them from "same time of day" comparisons.
      if (createdAtLocalDate(row.created_at) !== row.occurred_at) continue;
      const minutes = createdAtLocalMinutes(row.created_at);
      if (minutes === null || minutes > currentCutoff) continue;
    }
    history.set(row.occurred_at, (history.get(row.occurred_at) || 0) + Number(row.value_cents || 0));
  }

  const comparable = [...history.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4).map(([, value]) => value);
  if (comparable.length < 3) return null;
  const average = Math.round(mean(comparable));
  if (average <= 0) return null;
  const delta = (currentRevenue - average) / average;
  if (Math.abs(delta) < 0.15) return null;
  const percent = Math.round(Math.abs(delta) * 100);
  const dayLabel = weekdayPlural[targetWeekday] || "dias equivalentes";
  const when = requestedDay === today ? "Hoje" : "Esse dia";
  const cutoff = requestedDay === today ? " até este horário" : "";
  return `${when} está cerca de ${percent}% ${delta < 0 ? "abaixo" : "acima"} do ritmo médio das últimas ${comparable.length} ${dayLabel}${cutoff}, considerando o faturamento dos atendimentos registrados.`;
}
