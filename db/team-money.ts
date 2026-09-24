import { and, desc, eq, gt } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { dailyRecords, productSales, services, shopProducts, team, teamPaymentClosures, teamPayments } from "./schema";
import { barberPayoutCents } from "../lib/earnings";
import { isTeamPaymentKind, type TeamPaymentKind } from "../lib/team-payments";
import { appDate } from "../lib/app-date";
import { listPublicGalleryImages } from "./public-gallery";

export type TeamMoneyEntry = {
  id: number;
  teamMemberId: number;
  teamMemberName: string;
  occurredAt: string;
  kind: TeamPaymentKind;
  reason: string;
  valueCents: number;
};

export type TeamMoneyClosureSummary = {
  id: number;
  teamMemberId: number;
  teamMemberName: string;
  periodStartDate: string;
  periodEndDate: string;
  closedAt: string;
  paymentDay: number;
  earnedCents: number;
  tipCents: number;
  valeCents: number;
  paidCents: number;
  settlementCents: number;
  recordCount: number;
  isBaseline: boolean;
};

export type TeamMoneyRow = {
  teamMemberId: number;
  teamMemberName: string;
  role: string;
  photoUrl: string | null;
  paymentDay: number;
  earnedCents: number;
  tipCents: number;
  valeCents: number;
  paidCents: number;
  currentBalanceCents: number;
  openRecordCount: number;
  hasOpenActivity: boolean;
  lastClosure: TeamMoneyClosureSummary | null;
  openEntries: TeamMoneyEntry[];
};

export type TeamMoneyData = {
  rows: TeamMoneyRow[];
  closures: TeamMoneyClosureSummary[];
};

export type TeamClosureSnapshot = {
  version: 1;
  baseline?: boolean;
  organizationName: string;
  teamMember: { id: number; name: string; role: string };
  periodStartDate: string;
  periodEndDate: string;
  closedAt: string;
  paymentDay: number;
  totals: {
    earnedCents: number;
    tipCents: number;
    valeCents: number;
    paidCents: number;
    settlementCents: number;
    recordCount: number;
  };
  records: Array<{
    id: number;
    occurredAt: string;
    clientName: string;
    serviceName: string;
    recordType: string;
    commissionCents: number;
    tipCents: number;
    payoutCents: number;
  }>;
  productSales: Array<{
    id: number;
    occurredAt: string;
    clientName: string;
    productName: string;
    quantity: number;
    commissionCents: number;
  }>;
  entries: TeamMoneyEntry[];
};

type MemberRow = {
  id: number;
  name: string;
  role: string;
  paymentDay: number;
};

const publicClosure = (row: typeof teamPaymentClosures.$inferSelect): TeamMoneyClosureSummary => ({
  id: row.id,
  teamMemberId: row.teamMemberId,
  teamMemberName: row.teamMemberName,
  periodStartDate: row.periodStartDate,
  periodEndDate: row.periodEndDate,
  closedAt: row.closedAt,
  paymentDay: row.paymentDay,
  earnedCents: row.earnedCents,
  tipCents: row.tipCents,
  valeCents: row.valeCents,
  paidCents: row.paidCents,
  settlementCents: row.settlementCents,
  recordCount: row.recordCount,
  isBaseline: Boolean(row.isBaseline),
});

function nextDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function minimumDate(values: string[], fallback: string) {
  const valid = values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  return valid[0] ?? fallback;
}

async function memberCycle(organizationId: number, member: MemberRow) {
  const db = await getDb();
  const latestClosure = (await db.select().from(teamPaymentClosures).where(and(
    eq(teamPaymentClosures.organizationId, organizationId),
    eq(teamPaymentClosures.teamMemberId, member.id),
  )).orderBy(desc(teamPaymentClosures.id)).limit(1))[0];

  const recordCutoff = latestClosure?.lastDailyRecordId ?? 0;
  const productCutoff = latestClosure?.lastProductSaleId ?? 0;
  const paymentCutoff = latestClosure?.lastTeamPaymentId ?? 0;

  const [records, sales, rawEntries] = await Promise.all([
    db.select({
      id: dailyRecords.id,
      occurredAt: dailyRecords.occurredAt,
      clientName: dailyRecords.clientName,
      serviceName: services.name,
      recordType: dailyRecords.recordType,
      commissionCents: dailyRecords.commissionCents,
      tipCents: dailyRecords.tipCents,
    }).from(dailyRecords)
      .innerJoin(services, eq(dailyRecords.serviceId, services.id))
      .where(and(
        eq(dailyRecords.organizationId, organizationId),
        eq(dailyRecords.barberId, member.id),
        gt(dailyRecords.id, recordCutoff),
      ))
      .orderBy(dailyRecords.id),
    db.select({
      id: productSales.id,
      occurredAt: productSales.occurredAt,
      clientName: productSales.clientName,
      productName: shopProducts.name,
      quantity: productSales.quantity,
      commissionCents: productSales.commissionCents,
    }).from(productSales)
      .innerJoin(shopProducts, eq(productSales.productId, shopProducts.id))
      .where(and(
        eq(productSales.organizationId, organizationId),
        eq(productSales.sellerTeamMemberId, member.id),
        gt(productSales.id, productCutoff),
      ))
      .orderBy(productSales.id),
    db.select({
      id: teamPayments.id,
      teamMemberId: teamPayments.teamMemberId,
      teamMemberName: teamPayments.teamMemberName,
      occurredAt: teamPayments.occurredAt,
      kind: teamPayments.kind,
      reason: teamPayments.reason,
      valueCents: teamPayments.valueCents,
    }).from(teamPayments)
      .where(and(
        eq(teamPayments.organizationId, organizationId),
        eq(teamPayments.teamMemberId, member.id),
        gt(teamPayments.id, paymentCutoff),
      ))
      .orderBy(teamPayments.id),
  ]);

  const entries: TeamMoneyEntry[] = rawEntries
    .filter((entry) => isTeamPaymentKind(entry.kind))
    .map((entry) => ({ ...entry, kind: entry.kind as TeamPaymentKind }));
  const serviceEarningsCents = records.reduce((sum, record) => sum + barberPayoutCents(record), 0);
  const productEarningsCents = sales.reduce((sum, sale) => sum + sale.commissionCents, 0);
  const earnedCents = serviceEarningsCents + productEarningsCents;
  const tipCents = records.reduce((sum, record) => sum + record.tipCents, 0);
  const valeCents = entries.filter((entry) => entry.kind === "Vale").reduce((sum, entry) => sum + entry.valueCents, 0);
  const paidCents = entries.filter((entry) => entry.kind === "Pagamento").reduce((sum, entry) => sum + entry.valueCents, 0);
  const currentBalanceCents = earnedCents - valeCents - paidCents;
  const periodStartDate = latestClosure
    ? nextDate(latestClosure.periodEndDate)
    : minimumDate([
      ...records.map((record) => record.occurredAt),
      ...sales.map((sale) => sale.occurredAt),
      ...entries.map((entry) => entry.occurredAt),
    ], appDate());

  return {
    latestClosure,
    records,
    sales,
    entries,
    earnedCents,
    tipCents,
    valeCents,
    paidCents,
    currentBalanceCents,
    periodStartDate,
    lastDailyRecordId: records.reduce((max, record) => Math.max(max, record.id), recordCutoff),
    lastProductSaleId: sales.reduce((max, sale) => Math.max(max, sale.id), productCutoff),
    lastTeamPaymentId: entries.reduce((max, entry) => Math.max(max, entry.id), paymentCutoff),
  };
}

export async function getTeamMoneyData(access: AccessContext): Promise<TeamMoneyData> {
  const db = await getDb();
  const [memberRows, gallery] = await Promise.all([
    db.select({
      id: team.id,
      name: team.name,
      role: team.role,
      accessRole: team.accessRole,
      paymentDay: team.paymentDay,
    }).from(team).where(eq(team.organizationId, access.organizationId)).orderBy(team.name),
    listPublicGalleryImages(access.organizationId),
  ]);
  const photoByMember = new Map(
    gallery
      .filter((image) => image.kind === "barber" && image.teamMemberId)
      .map((image) => [Number(image.teamMemberId), image.url] as const),
  );

  const visibleMembers = memberRows
    .filter((member) => access.isOwner || member.id === access.teamMemberId);
  const cycles = await Promise.all(visibleMembers.map(async (member) => ({ member, cycle: await memberCycle(access.organizationId, member) })));

  const closureCondition = access.isOwner
    ? eq(teamPaymentClosures.organizationId, access.organizationId)
    : and(eq(teamPaymentClosures.organizationId, access.organizationId), eq(teamPaymentClosures.teamMemberId, access.teamMemberId));
  const closureRows = await db.select().from(teamPaymentClosures)
    .where(closureCondition)
    .orderBy(desc(teamPaymentClosures.closedAt), desc(teamPaymentClosures.id))
    .limit(access.isOwner ? 60 : 24);

  return {
    rows: cycles.map(({ member, cycle }) => ({
      teamMemberId: member.id,
      teamMemberName: member.name,
      role: member.role,
      photoUrl: photoByMember.get(member.id) ?? null,
      paymentDay: member.paymentDay,
      earnedCents: cycle.earnedCents,
      tipCents: cycle.tipCents,
      valeCents: cycle.valeCents,
      paidCents: cycle.paidCents,
      currentBalanceCents: cycle.currentBalanceCents,
      openRecordCount: cycle.records.length,
      hasOpenActivity: cycle.records.length > 0 || cycle.sales.length > 0 || cycle.entries.length > 0,
      lastClosure: cycle.latestClosure ? publicClosure(cycle.latestClosure) : null,
      openEntries: cycle.entries.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id),
    })),
    closures: closureRows.map(publicClosure),
  };
}

export async function saveTeamPaymentDay(access: AccessContext, teamMemberId: number, paymentDay: number) {
  requireOwner(access);
  const normalizedDay = Math.round(Number(paymentDay));
  if (!Number.isInteger(normalizedDay) || normalizedDay < 1 || normalizedDay > 31) throw new Error("Escolha um dia de pagamento entre 1 e 31.");
  const db = await getDb();
  const updated = await db.update(team).set({ paymentDay: normalizedDay }).where(and(
    eq(team.id, teamMemberId),
    eq(team.organizationId, access.organizationId),
  )).returning({ id: team.id });
  if (!updated.length) throw new Error("Funcionário não encontrado.");
}

export async function assertTeamPaymentOpen(organizationId: number, teamMemberId: number, paymentId: number) {
  const db = await getDb();
  const latestClosure = (await db.select({ lastTeamPaymentId: teamPaymentClosures.lastTeamPaymentId }).from(teamPaymentClosures).where(and(
    eq(teamPaymentClosures.organizationId, organizationId),
    eq(teamPaymentClosures.teamMemberId, teamMemberId),
  )).orderBy(desc(teamPaymentClosures.id)).limit(1))[0];
  if (latestClosure && paymentId <= latestClosure.lastTeamPaymentId) {
    throw new Error("Este lançamento já faz parte de um fechamento e não pode ser alterado. Registre um novo vale.");
  }
}

export async function closeTeamPaymentCycle(access: AccessContext, teamMemberId: number) {
  requireOwner(access);
  const db = await getDb();
  const member = (await db.select({
    id: team.id,
    name: team.name,
    role: team.role,
    accessRole: team.accessRole,
    paymentDay: team.paymentDay,
  }).from(team).where(and(
    eq(team.id, teamMemberId),
    eq(team.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!member) throw new Error("Escolha um profissional válido.");

  const cycle = await memberCycle(access.organizationId, member);
  const hasActivity = cycle.records.length > 0 || cycle.sales.length > 0 || cycle.entries.length > 0;
  if (!hasActivity) throw new Error("Não há movimentação nova para fechar deste funcionário.");

  const closedAt = new Date().toISOString();
  const periodEndDate = appDate();
  const settlementCents = cycle.currentBalanceCents;
  const snapshot: TeamClosureSnapshot = {
    version: 1,
    organizationName: access.organizationName,
    teamMember: { id: member.id, name: member.name, role: member.role },
    periodStartDate: cycle.periodStartDate,
    periodEndDate,
    closedAt,
    paymentDay: member.paymentDay,
    totals: {
      earnedCents: cycle.earnedCents,
      tipCents: cycle.tipCents,
      valeCents: cycle.valeCents,
      paidCents: cycle.paidCents,
      settlementCents,
      recordCount: cycle.records.length,
    },
    records: cycle.records.map((record) => ({
      ...record,
      payoutCents: barberPayoutCents(record),
    })),
    productSales: cycle.sales,
    entries: cycle.entries,
  };

  const [created] = await db.insert(teamPaymentClosures).values({
    organizationId: access.organizationId,
    teamMemberId: member.id,
    teamMemberName: member.name,
    periodStartDate: cycle.periodStartDate,
    periodEndDate,
    closedAt,
    paymentDay: member.paymentDay,
    earnedCents: cycle.earnedCents,
    tipCents: cycle.tipCents,
    valeCents: cycle.valeCents,
    paidCents: cycle.paidCents,
    settlementCents,
    recordCount: cycle.records.length,
    lastDailyRecordId: cycle.lastDailyRecordId,
    lastProductSaleId: cycle.lastProductSaleId,
    lastTeamPaymentId: cycle.lastTeamPaymentId,
    snapshotJson: JSON.stringify(snapshot),
    createdByTeamMemberId: access.teamMemberId,
    isBaseline: false,
  }).returning({ id: teamPaymentClosures.id });
  if (!created) throw new Error("Não foi possível fechar o pagamento.");
  return created.id;
}

export async function getTeamPaymentClosureForAccess(access: AccessContext, closureId: number) {
  const db = await getDb();
  const closure = (await db.select().from(teamPaymentClosures).where(and(
    eq(teamPaymentClosures.id, closureId),
    eq(teamPaymentClosures.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!closure || (!access.isOwner && closure.teamMemberId !== access.teamMemberId)) throw new Error("Fechamento não encontrado.");
  if (closure.isBaseline) throw new Error("Este fechamento antigo não possui comprovante em PDF.");
  let snapshot: TeamClosureSnapshot;
  try {
    snapshot = JSON.parse(closure.snapshotJson) as TeamClosureSnapshot;
  } catch {
    throw new Error("O comprovante deste fechamento está inválido.");
  }
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.entries)) throw new Error("O comprovante deste fechamento está inválido.");
  return { closure, snapshot };
}
