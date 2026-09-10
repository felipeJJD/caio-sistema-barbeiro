import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AccessContext } from "./access";
import { isOrganizationAccessExpired, requireOwnBarber, requireOwner } from "./access";
import { syncTeamAccount } from "./auth";
import { getDb } from "./index";
import { listNotifications, notifyOwnersOfAppointmentCancellation, notifyOwnersOfAttendance, type AppNotification } from "./notifications";
import { getPlatformBillingOffer, type PlatformBillingOffer } from "./platform-billing";
import { deleteProductSalesForDailyRecord, getProductsData, registerProductSaleBundle, replaceProductSalesForDailyRecord, syncProductSalesForDailyRecord, type EditableProductSaleItemInput, type ProductSale, type ProductSaleItemInput, type ShopProduct } from "./products";
import { appointments, authAccounts, clients, dailyRecords, expenses, goals, membershipPayments, organizations, paymentMethods, plans, services, team } from "./schema";
import { appDate, appMonth, appTimeMinutes, membershipRenewalDates, nextMonthDueDate } from "../lib/app-date";
import { barberPayoutCents } from "../lib/earnings";
import { activeMembershipTotals, membershipPayoutCentsForAccessRole } from "../lib/membership-summary";
import { validClientName } from "../lib/client-name";
import { parseBookingWeekdays, serializeBookingWeekdays } from "../lib/booking-weekdays";

export type DashboardData = {
  dataPeriod: { start: string; end: string };
  viewer: { name: string; email: string; role: "owner" | "barber"; isOwner: boolean; isPlatformAdmin: boolean; teamMemberId: number; organizationName: string; organizationStatus: string; trialEndsAt: string | null };
  clients: Array<{ id: number; name: string; phone: string; plan: string; planKind: string; planId: number; paymentMethodId: number; paymentName: string; balance: number; maxBalance: number; dueDate: string; status: string; monthlyValueCents: number; paidMonth: string; usedThisMonth: number; remaining: number; overLimit: boolean }>;
  plans: Array<{ id: number; name: string; planKind: string; monthlyValueCents: number; maxUses: number; barberPayoutCents: number; active: boolean }>;
  team: Array<{ id: number; name: string; role: string; loginEmail: string | null; accessRole: string; commissionCents: number; commissionRateBps: number; active: boolean; hasPassword: boolean }>;
  services: Array<{ id: number; name: string; priceCents: number; durationMinutes: number; active: boolean }>;
  agendaSettings: { useServiceDuration: boolean; openingTime: string; closingTime: string; publicBookingEnabled: boolean; publicBookingRequiresApproval: boolean; publicBookingWeekdays: number[]; publicBookingSlug: string };
  paymentMethods: Array<{ id: number; name: string; feeBps: number }>;
  membershipPayments: Array<{ id: number; clientId: number; clientName: string; planName: string; planKind: string; paymentMethodId: number; paymentName: string; paidMonth: string; occurredAt: string; amountCents: number; feeCents: number }>;
  records: Array<{ id: number; occurredAt: string; clientName: string; barberId: number; barberName: string; serviceId: number; serviceName: string; paymentMethodId: number; paymentName: string; quantity: number; valueCents: number; commissionCents: number; feeCents: number; tipCents: number; origin: string; recordType: string; membershipClientId: number | null }>;
  expenses: Array<{ id: number; occurredAt: string; type: string; description: string; valueCents: number; paid: boolean }>;
  appointments: Array<{ id: number; appointmentDate: string; appointmentTime: string; clientName: string; phone: string; serviceId: number; serviceName: string; durationMinutes: number; barberId: number; barberName: string; notes: string; status: string; reminderSentAt: string | null; paymentChoice: string }>;
  notifications: AppNotification[];
  products: ShopProduct[];
  productSales: ProductSale[];
  goal: { revenueCents: number; grossProfitCents: number; expenseCents: number; netProfitCents: number; attendanceTarget: number };
  stats: { revenueCents: number; serviceRevenueCents: number; membershipRevenueCents: number; productRevenueCents: number; productCostCents: number; productProfitCents: number; feeCents: number; expenseCents: number; commissionCents: number; myEarningsCents: number; grossProfitCents: number; netProfitCents: number; visitsThisMonth: number; workedDays: number; averageTicketCents: number; active: number; pending: number; openSpots: number };
  membershipSummary: { ownerPayoutCents: number; ownerVisits: number; totalUses: number; shopBalanceCents: number };
  serviceRanking: Array<{ name: string; count: number; valueCents: number }>;
  barberRanking: Array<{ name: string; count: number; valueCents: number; commissionCents: number }>;
  billingOffer: PlatformBillingOffer;
};

const defaultOrganizationId = 1;

function dashboardPeriod(input?: { start?: string; end?: string }) {
  const currentDate = appDate();
  const fallback = { start: `${appMonth(currentDate)}-01`, end: currentDate };
  const start = input?.start ?? fallback.start;
  const end = input?.end ?? fallback.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return fallback;
  const startTime = Date.parse(`${start}T12:00:00Z`);
  const endTime = Date.parse(`${end}T12:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime - startTime > 370 * 86400000) return fallback;
  return { start, end };
}

async function tableCount(table: typeof organizations | typeof clients | typeof plans | typeof team | typeof services | typeof paymentMethods | typeof dailyRecords | typeof expenses | typeof goals | typeof appointments) {
  const db = await getDb();
  return Number((await db.select({ count: sql<number>`count(*)` }).from(table))[0]?.count ?? 0);
}

export async function ensureDemoData() {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_DATA !== 'true') return;
  const db = await getDb();
  const existingOrganization = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, defaultOrganizationId)).limit(1);
  if (existingOrganization.length) return;

  const today = appDate();
  const month = appMonth(today);
  const dueDate = nextMonthDueDate(today);
  await db.insert(organizations).values({ id: defaultOrganizationId, name: "Kaio Barbearia", slug: "kaio-barbearia" });
  if (await tableCount(plans) === 0) await db.insert(plans).values([
    { organizationId: defaultOrganizationId, name: "4 cortes", planKind: "Corte", monthlyValueCents: 8990, maxUses: 4, barberPayoutCents: 1500 },
    { organizationId: defaultOrganizationId, name: "4 cortes + barba", planKind: "Corte + barba", monthlyValueCents: 14990, maxUses: 4, barberPayoutCents: 2500 },
  ]);
  if (await tableCount(team) === 0) await db.insert(team).values([
    { organizationId: defaultOrganizationId, name: "Davi", role: "Barbeiro", accessRole: "barber", loginEmail: null, commissionCents: 0, commissionRateBps: 5000 },
    { organizationId: defaultOrganizationId, name: "Eduardo", role: "Barbeiro", accessRole: "barber", loginEmail: "barber@example.invalid", commissionCents: 0, commissionRateBps: 6000 },
    { organizationId: defaultOrganizationId, name: "Kaio", role: "Administrador", accessRole: "owner", loginEmail: "owner@example.invalid", platformAdmin: true, commissionCents: 0, commissionRateBps: 6500 },
  ]);
  if (await tableCount(services) === 0) await db.insert(services).values([
    { organizationId: defaultOrganizationId, name: "Corte", priceCents: 3000 }, { organizationId: defaultOrganizationId, name: "Barba", priceCents: 3000 }, { organizationId: defaultOrganizationId, name: "Corte + barba", priceCents: 5500 },
    { organizationId: defaultOrganizationId, name: "Corte + sobrancelha", priceCents: 3500 }, { organizationId: defaultOrganizationId, name: "Corte + bigode", priceCents: 4000 }, { organizationId: defaultOrganizationId, name: "Pezinho", priceCents: 1500 }, { organizationId: defaultOrganizationId, name: "Pigmentado", priceCents: 2500 },
  ]);
  if (await tableCount(paymentMethods) === 0) await db.insert(paymentMethods).values([
    { organizationId: defaultOrganizationId, name: "Dinheiro", feeBps: 0 }, { organizationId: defaultOrganizationId, name: "Débito", feeBps: 165 }, { organizationId: defaultOrganizationId, name: "Crédito", feeBps: 354 }, { organizationId: defaultOrganizationId, name: "Pix", feeBps: 0 },
  ]);
  if (await tableCount(goals) === 0) await db.insert(goals).values({ organizationId: defaultOrganizationId, month, revenueCents: 400000, grossProfitCents: 300000, expenseCents: 80000, netProfitCents: 200000, attendanceTarget: 100 });
  if (await tableCount(expenses) === 0) await db.insert(expenses).values({ organizationId: defaultOrganizationId, occurredAt: today, type: "Variável", description: "Toalhas", valueCents: 2460, paid: true });

  const planList = await db.select().from(plans).where(eq(plans.organizationId, defaultOrganizationId)).orderBy(plans.id);
  let clientCount = await tableCount(clients);
  if (clientCount === 0) {
    const rows = Array.from({ length: 13 }, (_, index) => {
      const plan = planList[index < 8 ? 0 : Math.min(1, planList.length - 1)];
      return { organizationId: defaultOrganizationId, name: index < 8 ? `Cliente corte ${index + 1}` : `Cliente completo ${index - 7}`, phone: "", plan: plan.name, planKind: plan.planKind, planId: plan.id, balance: plan.maxUses, maxBalance: plan.maxUses, dueDate, status: "Ativo", monthlyValueCents: plan.monthlyValueCents, paidMonth: month };
    });
    await db.insert(clients).values(rows); clientCount = 13;
  } else if (clientCount < 13 && planList.length) {
    const existingClients = await db.select().from(clients).where(eq(clients.organizationId, defaultOrganizationId));
    let cutCount = existingClients.filter((client) => !client.planKind.toLowerCase().includes("barba")).length;
    let completeCount = existingClients.length - cutCount;
    const rows = Array.from({ length: 13 - clientCount }, (_, index) => {
      const useCutPlan = cutCount < 8 || completeCount >= 5;
      const plan = planList[useCutPlan ? 0 : Math.min(1, planList.length - 1)];
      if (useCutPlan) cutCount += 1; else completeCount += 1;
      return { organizationId: defaultOrganizationId, name: `Mensalista ${String(clientCount + index + 1).padStart(2, "0")}`, phone: "", plan: plan.name, planKind: plan.planKind, planId: plan.id, balance: plan.maxUses, maxBalance: plan.maxUses, dueDate, status: "Ativo", monthlyValueCents: plan.monthlyValueCents, paidMonth: month };
    });
    await db.insert(clients).values(rows);
  }
  const unlinked = await db.select().from(clients).where(and(eq(clients.organizationId, defaultOrganizationId), eq(clients.planId, 0)));
  for (const client of unlinked) {
    const plan = planList.find((item) => item.planKind.toLowerCase() === client.planKind.toLowerCase()) ?? planList[0];
    if (plan) await db.update(clients).set({ planId: plan.id, plan: plan.name, planKind: plan.planKind, monthlyValueCents: plan.monthlyValueCents, maxBalance: plan.maxUses }).where(and(eq(clients.id, client.id), eq(clients.organizationId, defaultOrganizationId)));
  }
  if (await tableCount(appointments) === 0) {
    const teamList = await db.select().from(team).where(eq(team.organizationId, defaultOrganizationId)).orderBy(team.id);
    const serviceList = await db.select().from(services).where(eq(services.organizationId, defaultOrganizationId)).orderBy(services.id);
    if (teamList.length && serviceList.length) await db.insert(appointments).values({ organizationId: defaultOrganizationId, appointmentDate: today, appointmentTime: "14:30", clientName: "Cliente agendado", phone: "", serviceId: serviceList[0].id, barberId: teamList[0].id, notes: "", status: "Agendado" });
  }
}

function emptyDashboard(access: AccessContext, period = dashboardPeriod()): DashboardData {
  return { dataPeriod: period, viewer: { name: access.name, email: access.email, role: access.role, isOwner: access.isOwner, isPlatformAdmin: access.isPlatformAdmin, teamMemberId: access.teamMemberId, organizationName: access.organizationName, organizationStatus: access.organizationStatus, trialEndsAt: access.trialEndsAt }, clients: [], plans: [], team: [], services: [], agendaSettings: { useServiceDuration: false, openingTime: "08:00", closingTime: "19:00", publicBookingEnabled: true, publicBookingRequiresApproval: true, publicBookingWeekdays: parseBookingWeekdays(null), publicBookingSlug: "" }, paymentMethods: [], membershipPayments: [], records: [], expenses: [], appointments: [], notifications: [], products: [], productSales: [], goal: { revenueCents: 0, grossProfitCents: 0, expenseCents: 0, netProfitCents: 0, attendanceTarget: 0 }, stats: { revenueCents: 0, serviceRevenueCents: 0, membershipRevenueCents: 0, productRevenueCents: 0, productCostCents: 0, productProfitCents: 0, feeCents: 0, expenseCents: 0, commissionCents: 0, myEarningsCents: 0, grossProfitCents: 0, netProfitCents: 0, visitsThisMonth: 0, workedDays: 0, averageTicketCents: 0, active: 0, pending: 0, openSpots: 30 }, membershipSummary: { ownerPayoutCents: 0, ownerVisits: 0, totalUses: 0, shopBalanceCents: 0 }, serviceRanking: [], barberRanking: [], billingOffer: { pixPriceCents: 999, pixPeriodDays: 30, quarterlyDiscountBps: 1000, semiannualDiscountBps: 1500, annualDiscountBps: 2000, pixPlans: [{ code: "monthly", label: "Mensal", months: 1, periodDays: 30, priceCents: 999, discountBps: 0 }, { code: "quarterly", label: "Trimestral", months: 3, periodDays: 90, priceCents: 2697, discountBps: 1000 }, { code: "semiannual", label: "Semestral", months: 6, periodDays: 180, priceCents: 5095, discountBps: 1500 }, { code: "annual", label: "Anual", months: 12, periodDays: 365, priceCents: 9590, discountBps: 2000 }] } };
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

async function archiveFinishedAppointments(organizationId: number) {
  const db = await getDb();
  const today = appDate();
  const currentMinutes = appTimeMinutes();
  const candidates = await db.select({
    id: appointments.id,
    appointmentDate: appointments.appointmentDate,
    appointmentTime: appointments.appointmentTime,
    durationMinutes: services.durationMinutes,
  }).from(appointments).innerJoin(services, eq(appointments.serviceId, services.id)).where(and(
    eq(appointments.organizationId, organizationId),
    eq(appointments.status, "Agendado"),
  ));
  const finishedIds = candidates.filter((item) => {
    if (item.appointmentDate < today) return true;
    if (item.appointmentDate > today) return false;
    const startMinutes = timeToMinutes(item.appointmentTime);
    return Number.isFinite(startMinutes) && startMinutes + item.durationMinutes <= currentMinutes;
  }).map((item) => item.id);
  if (!finishedIds.length) return 0;
  await db.update(appointments).set({ status: "Concluído" }).where(and(
    eq(appointments.organizationId, organizationId),
    eq(appointments.status, "Agendado"),
    inArray(appointments.id, finishedIds),
  ));
  return finishedIds.length;
}

export async function syncFinishedAppointments(access: AccessContext) {
  return archiveFinishedAppointments(access.organizationId);
}

async function upsertMembershipPaymentSnapshot(input: {
  organizationId: number;
  clientId: number;
  clientName: string;
  planName: string;
  planKind: string;
  paymentMethodId: number;
  paymentName: string;
  paidMonth: string;
  occurredAt?: string;
  amountCents: number;
  paymentFeeBps: number;
}): Promise<DashboardData["membershipPayments"][number] | null> {
  if (!/^\d{4}-\d{2}$/.test(input.paidMonth)) return null;
  const db = await getDb();
  const occurredAt = input.occurredAt?.startsWith(`${input.paidMonth}-`)
    ? input.occurredAt
    : `${input.paidMonth}-01`;
  const updateValues = {
    organizationId: input.organizationId,
    clientId: input.clientId,
    clientName: input.clientName,
    planName: input.planName,
    planKind: input.planKind,
    paymentMethodId: input.paymentMethodId,
    paymentName: input.paymentName,
    paidMonth: input.paidMonth,
    amountCents: input.amountCents,
    feeCents: Math.round(input.amountCents * input.paymentFeeBps / 10000),
    updatedAt: new Date().toISOString(),
  };
  const [snapshot] = await db.insert(membershipPayments).values({ ...updateValues, occurredAt }).onConflictDoUpdate({
    target: [membershipPayments.organizationId, membershipPayments.clientId, membershipPayments.paidMonth],
    // Editing a mensalista must not rewrite the original payment date.
    set: updateValues,
  }).returning({
    id: membershipPayments.id,
    clientId: membershipPayments.clientId,
    clientName: membershipPayments.clientName,
    planName: membershipPayments.planName,
    planKind: membershipPayments.planKind,
    paymentMethodId: membershipPayments.paymentMethodId,
    paymentName: membershipPayments.paymentName,
    paidMonth: membershipPayments.paidMonth,
    occurredAt: membershipPayments.occurredAt,
    amountCents: membershipPayments.amountCents,
    feeCents: membershipPayments.feeCents,
  });
  return snapshot ?? null;
}

export async function getDashboardData(access: AccessContext, requestedPeriod?: { start?: string; end?: string }): Promise<DashboardData> {
  const period = dashboardPeriod(requestedPeriod);
  try {
    if (isOrganizationAccessExpired(access)) {
      const restrictedData = emptyDashboard(access, period);
      restrictedData.agendaSettings.publicBookingEnabled = false;
      restrictedData.billingOffer = await getPlatformBillingOffer();
      return restrictedData;
    }
    await ensureDemoData();
    const db = await getDb();
    const month = appMonth();
    const organizationId = access.organizationId;
    const organization = (await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0];
    const recordOwnershipCondition = access.isOwner
      ? eq(dailyRecords.organizationId, organizationId)
      : and(eq(dailyRecords.organizationId, organizationId), eq(dailyRecords.barberId, access.teamMemberId));
    const recordCondition = and(recordOwnershipCondition, gte(dailyRecords.occurredAt, period.start), lte(dailyRecords.occurredAt, period.end));
    const appointmentOwnershipCondition = access.isOwner
      ? eq(appointments.organizationId, organizationId)
      : and(eq(appointments.organizationId, organizationId), eq(appointments.barberId, access.teamMemberId));
    const appointmentCondition = and(appointmentOwnershipCondition, or(
      eq(appointments.status, "Aguardando"),
      eq(appointments.status, "Aguardando pagamento"),
      eq(appointments.status, "Agendado"),
      eq(appointments.status, "Confirmado"),
      and(gte(appointments.appointmentDate, period.start), lte(appointments.appointmentDate, period.end)),
    ));
    const periodStartMonth = period.start.slice(0, 7);
    const periodEndMonth = period.end.slice(0, 7);
    const [rawClients, rawPlans, rawTeam, accountRows, serviceList, payments, rawMembershipPayments, expenseList, goalRows, recordList, appointmentList, notificationList, productData, billingOffer] = await Promise.all([
      db.select().from(clients).where(and(eq(clients.organizationId, organizationId), isNull(clients.deletedAt))).orderBy(clients.name),
      db.select().from(plans).where(eq(plans.organizationId, organizationId)).orderBy(plans.id),
      db.select().from(team).where(eq(team.organizationId, organizationId)).orderBy(team.name),
      access.isOwner ? db.select({ teamMemberId: authAccounts.teamMemberId }).from(authAccounts).where(eq(authAccounts.organizationId, organizationId)) : Promise.resolve([]),
      db.select().from(services).where(and(eq(services.organizationId, organizationId), isNull(services.deletedAt))).orderBy(services.name),
      db.select().from(paymentMethods).where(eq(paymentMethods.organizationId, organizationId)).orderBy(paymentMethods.id),
      access.isOwner ? db.select({ id: membershipPayments.id, clientId: membershipPayments.clientId, clientName: membershipPayments.clientName, planName: membershipPayments.planName, planKind: membershipPayments.planKind, paymentMethodId: membershipPayments.paymentMethodId, paymentName: membershipPayments.paymentName, paidMonth: membershipPayments.paidMonth, occurredAt: membershipPayments.occurredAt, amountCents: membershipPayments.amountCents, feeCents: membershipPayments.feeCents }).from(membershipPayments).where(and(eq(membershipPayments.organizationId, organizationId), or(and(gte(membershipPayments.occurredAt, period.start), lte(membershipPayments.occurredAt, period.end)), and(gte(membershipPayments.paidMonth, periodStartMonth), lte(membershipPayments.paidMonth, periodEndMonth))))).orderBy(desc(membershipPayments.paidMonth), desc(membershipPayments.id)) : Promise.resolve([]),
      access.isOwner ? db.select().from(expenses).where(and(eq(expenses.organizationId, organizationId), gte(expenses.occurredAt, period.start), lte(expenses.occurredAt, period.end))).orderBy(desc(expenses.occurredAt)) : Promise.resolve([]),
      access.isOwner ? db.select().from(goals).where(and(eq(goals.organizationId, organizationId), eq(goals.month, month))).limit(1) : Promise.resolve([]),
      db.select({ id: dailyRecords.id, occurredAt: dailyRecords.occurredAt, clientName: dailyRecords.clientName, barberId: dailyRecords.barberId, barberName: team.name, serviceId: dailyRecords.serviceId, serviceName: services.name, paymentMethodId: dailyRecords.paymentMethodId, paymentName: paymentMethods.name, quantity: dailyRecords.quantity, valueCents: dailyRecords.valueCents, commissionCents: dailyRecords.commissionCents, feeCents: dailyRecords.feeCents, tipCents: dailyRecords.tipCents, origin: dailyRecords.origin, recordType: dailyRecords.recordType, membershipClientId: dailyRecords.membershipClientId }).from(dailyRecords).innerJoin(team, eq(dailyRecords.barberId, team.id)).innerJoin(services, eq(dailyRecords.serviceId, services.id)).innerJoin(paymentMethods, eq(dailyRecords.paymentMethodId, paymentMethods.id)).where(recordCondition).orderBy(desc(dailyRecords.occurredAt), desc(dailyRecords.id)),
      db.select({ id: appointments.id, appointmentDate: appointments.appointmentDate, appointmentTime: appointments.appointmentTime, clientName: appointments.clientName, phone: appointments.phone, serviceId: appointments.serviceId, serviceName: services.name, durationMinutes: services.durationMinutes, barberId: appointments.barberId, barberName: team.name, notes: appointments.notes, status: appointments.status, reminderSentAt: appointments.reminderSentAt, paymentChoice: appointments.paymentChoice }).from(appointments).innerJoin(team, eq(appointments.barberId, team.id)).innerJoin(services, eq(appointments.serviceId, services.id)).where(appointmentCondition).orderBy(appointments.appointmentDate, appointments.appointmentTime),
      listNotifications(access),
      getProductsData(access, period),
      getPlatformBillingOffer(),
    ]);
    const today = appDate();
    const legacyFuturePayments = rawMembershipPayments.filter((payment) => (
      payment.paidMonth === month
      && payment.occurredAt === `${payment.paidMonth}-08`
      && payment.occurredAt > today
    ));
    if (access.isOwner && legacyFuturePayments.length) {
      await Promise.all(legacyFuturePayments.map((payment) => db.update(membershipPayments)
        .set({ occurredAt: today, updatedAt: new Date().toISOString() })
        .where(and(eq(membershipPayments.id, payment.id), eq(membershipPayments.organizationId, organizationId)))));
    }
    const normalizedMembershipPayments = rawMembershipPayments.map((payment) => legacyFuturePayments.some((legacy) => legacy.id === payment.id)
      ? { ...payment, occurredAt: today }
      : payment);
    const accountTeamIds = new Set(accountRows.map((account) => account.teamMemberId));
    const teamList = access.isOwner ? rawTeam : rawTeam.filter((member) => member.id === access.teamMemberId);
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const knownMembershipPaymentKeys = new Set(normalizedMembershipPayments.map((payment) => `${payment.clientId}:${payment.paidMonth}`));
    const backfilledMembershipPayments = access.isOwner ? (await Promise.all(rawClients
      .filter((client) => client.status === "Ativo" && /^\d{4}-\d{2}$/.test(client.paidMonth) && client.paidMonth >= periodStartMonth && client.paidMonth <= periodEndMonth && !knownMembershipPaymentKeys.has(`${client.id}:${client.paidMonth}`))
      .map((client) => {
        const payment = paymentById.get(client.paymentMethodId);
        return upsertMembershipPaymentSnapshot({ organizationId, clientId: client.id, clientName: client.name, planName: client.plan, planKind: client.planKind, paymentMethodId: client.paymentMethodId, paymentName: payment?.name ?? "Não informado", paidMonth: client.paidMonth, amountCents: client.monthlyValueCents, paymentFeeBps: payment?.feeBps ?? 0 });
      }))).filter((payment): payment is DashboardData["membershipPayments"][number] => Boolean(payment)) : [];
    const membershipPaymentList = [...normalizedMembershipPayments, ...backfilledMembershipPayments]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id - left.id);
    const currentRecords = recordList.filter((item) => item.occurredAt.startsWith(month));
    const clientsWithUsage = rawClients.map((client) => { const usedThisMonth = currentRecords.filter((record) => record.recordType === "Mensalista" && record.membershipClientId === client.id).reduce((sum, record) => sum + record.quantity, 0); return { ...client, paymentName: paymentById.get(client.paymentMethodId)?.name ?? "Não informado", monthlyValueCents: access.isOwner ? client.monthlyValueCents : 0, usedThisMonth, remaining: Math.max(0, client.maxBalance - usedThisMonth), overLimit: usedThisMonth > client.maxBalance }; });
    const planList = rawPlans.map((plan) => ({ ...plan, monthlyValueCents: access.isOwner ? plan.monthlyValueCents : 0 }));
    const visibleTeam = teamList.map((member) => ({ ...member, loginEmail: access.isOwner ? member.loginEmail : null, hasPassword: accountTeamIds.has(member.id) }));
    const membershipRecords = currentRecords.filter((item) => item.recordType === "Mensalista");
    const currentMembershipPayments = membershipPaymentList.filter((payment) => payment.paidMonth === month);
    const activeMembership = activeMembershipTotals(rawClients, currentMembershipPayments, membershipRecords);
    const membershipRevenueCents = currentMembershipPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const membershipFeeCents = currentMembershipPayments.reduce((sum, payment) => sum + payment.feeCents, 0);
    const serviceRevenueCents = currentRecords.reduce((sum, item) => sum + item.valueCents + item.tipCents, 0);
    const currentProductSales = productData.sales.filter((sale) => sale.occurredAt.startsWith(month));
    const productRevenueCents = currentProductSales.reduce((sum, sale) => sum + sale.revenueCents, 0);
    const productCostCents = access.isOwner ? currentProductSales.reduce((sum, sale) => sum + sale.unitCostCents * sale.quantity, 0) : 0;
    const productFeeCents = access.isOwner ? currentProductSales.reduce((sum, sale) => sum + sale.feeCents, 0) : 0;
    const productCommissionCents = currentProductSales.reduce((sum, sale) => sum + sale.commissionCents, 0);
    const productProfitCents = access.isOwner ? productRevenueCents - productCostCents - productFeeCents - productCommissionCents : 0;
    const revenueCents = membershipRevenueCents + serviceRevenueCents + (access.isOwner ? productRevenueCents : 0);
    const feeCents = currentRecords.reduce((sum, item) => sum + item.feeCents, 0) + productFeeCents + membershipFeeCents;
    const commissionCents = currentRecords.reduce((sum, item) => sum + barberPayoutCents(item), 0) + productCommissionCents;
    const expenseCents = expenseList.filter((item) => item.occurredAt.startsWith(month)).reduce((sum, item) => sum + item.valueCents, 0);
    const grossProfitCents = access.isOwner ? revenueCents - feeCents - productCostCents - expenseCents : serviceRevenueCents;
    const netProfitCents = access.isOwner ? grossProfitCents - commissionCents : commissionCents;
    const serviceMap = new Map<string, { name: string; count: number; valueCents: number }>();
    const barberMap = new Map<string, { name: string; count: number; valueCents: number; commissionCents: number }>();
    for (const item of currentRecords) {
      const service = serviceMap.get(item.serviceName) ?? { name: item.serviceName, count: 0, valueCents: 0 }; service.count += item.quantity; service.valueCents += item.valueCents; serviceMap.set(item.serviceName, service);
      const barber = barberMap.get(item.barberName) ?? { name: item.barberName, count: 0, valueCents: 0, commissionCents: 0 }; barber.count += item.quantity; barber.valueCents += item.valueCents; barber.commissionCents += barberPayoutCents(item); barberMap.set(item.barberName, barber);
    }
    for (const sale of currentProductSales) {
      const barber = barberMap.get(sale.sellerName) ?? { name: sale.sellerName, count: 0, valueCents: 0, commissionCents: 0 };
      barber.valueCents += sale.revenueCents;
      barber.commissionCents += sale.commissionCents;
      barberMap.set(sale.sellerName, barber);
    }
    const active = rawClients.filter((client) => client.status === "Ativo").length;
    const pending = rawClients.filter((client) => client.status === "Pendente").length;
    const goal = goalRows[0] ?? { revenueCents: 0, grossProfitCents: 0, expenseCents: 0, netProfitCents: 0, attendanceTarget: 0 };
    const activeClientIds = new Set(rawClients.filter((client) => client.status === "Ativo").map((client) => client.id));
    const ownerActiveMembershipRecords = membershipRecords.filter((item) => item.barberId === access.teamMemberId && item.membershipClientId !== null && activeClientIds.has(item.membershipClientId));
    const membershipSummary = access.isOwner ? { ownerPayoutCents: ownerActiveMembershipRecords.reduce((sum, item) => sum + barberPayoutCents(item), 0), ownerVisits: ownerActiveMembershipRecords.reduce((sum, item) => sum + item.quantity, 0), totalUses: activeMembership.uses, shopBalanceCents: activeMembership.revenueCents - activeMembership.payoutCents } : { ownerPayoutCents: 0, ownerVisits: 0, totalUses: activeMembership.uses, shopBalanceCents: 0 };
    return { dataPeriod: period, viewer: { name: access.name, email: access.email, role: access.role, isOwner: access.isOwner, isPlatformAdmin: access.isPlatformAdmin, teamMemberId: access.teamMemberId, organizationName: access.organizationName, organizationStatus: access.organizationStatus, trialEndsAt: access.trialEndsAt }, clients: clientsWithUsage, plans: planList, team: visibleTeam, services: serviceList, agendaSettings: { useServiceDuration: organization?.useServiceDurationInAgenda ?? false, openingTime: organization?.openingTime ?? "08:00", closingTime: organization?.closingTime ?? "19:00", publicBookingEnabled: organization?.publicBookingEnabled ?? true, publicBookingRequiresApproval: organization?.publicBookingRequiresApproval ?? true, publicBookingWeekdays: parseBookingWeekdays(organization?.publicBookingWeekdays), publicBookingSlug: organization?.slug ?? "" }, paymentMethods: payments, membershipPayments: membershipPaymentList, records: recordList, expenses: expenseList, appointments: appointmentList, notifications: notificationList, products: productData.products, productSales: productData.sales, goal, stats: { revenueCents, serviceRevenueCents, membershipRevenueCents, productRevenueCents, productCostCents, productProfitCents, feeCents, expenseCents, commissionCents, myEarningsCents: commissionCents, grossProfitCents, netProfitCents, visitsThisMonth: currentRecords.reduce((sum, item) => sum + item.quantity, 0), workedDays: new Set(currentRecords.map((item) => item.occurredAt)).size, averageTicketCents: currentRecords.length ? Math.round(serviceRevenueCents / currentRecords.length) : 0, active, pending, openSpots: Math.max(0, 30 - active) }, membershipSummary, serviceRanking: [...serviceMap.values()].sort((a, b) => b.count - a.count), barberRanking: [...barberMap.values()].sort((a, b) => b.valueCents - a.valueCents), billingOffer };
  } catch {
    return emptyDashboard(access, period);
  }
}

function validTipCents(value = 0) {
  const tip = Math.round(Number(value));
  if (!Number.isFinite(tip) || tip < 0 || tip > 1000000) throw new Error("Informe uma gorjeta válida de até R$ 10.000,00.");
  return tip;
}

export async function createDailyRecord(access: AccessContext, input: { occurredAt: string; recordType: string; clientName?: string; membershipClientId?: number; barberId: number; serviceId?: number; paymentMethodId?: number; origin?: string; tipCents?: number; productItems?: ProductSaleItemInput[] }) {
  requireOwnBarber(access, input.barberId);
  const tipCents = validTipCents(input.tipCents);
  const db = await getDb();
  const barber = (await db.select().from(team).where(and(eq(team.id, input.barberId), eq(team.organizationId, access.organizationId))).limit(1))[0];
  if (!barber) throw new Error("Escolha o barbeiro.");
  if (input.recordType === "Mensalista") {
    const client = (await db.select().from(clients).where(and(eq(clients.id, input.membershipClientId ?? 0), eq(clients.organizationId, access.organizationId), isNull(clients.deletedAt))).limit(1))[0];
    if (!client) throw new Error("Escolha o mensalista.");
    if (client.status !== "Ativo") throw new Error("Este mensalista não está ativo.");
    const paymentList = await db.select().from(paymentMethods).where(eq(paymentMethods.organizationId, access.organizationId)).orderBy(paymentMethods.id);
    const selectedPayment = paymentList.find((item) => item.id === input.paymentMethodId);
    const payment = input.productItems?.length
      ? selectedPayment
      : paymentList.find((item) => item.id === client.paymentMethodId) ?? paymentList[0];
    if (!payment) throw new Error(input.productItems?.length ? "Escolha como os produtos foram pagos." : "Cadastre uma forma de pagamento antes de registrar o uso.");
    const plan = (await db.select().from(plans).where(and(eq(plans.id, client.planId), eq(plans.organizationId, access.organizationId))).limit(1))[0];
    const serviceList = await db.select().from(services).where(and(eq(services.organizationId, access.organizationId), isNull(services.deletedAt)));
    const service = serviceList.find((item) => item.name.toLowerCase() === (plan?.planKind ?? client.planKind).toLowerCase()) ?? serviceList[0];
    if (!service) throw new Error("Cadastre o serviço do plano.");
    const payout = membershipPayoutCentsForAccessRole(barber.accessRole, plan?.barberPayoutCents, client.planKind);
    const [, inserted] = await db.batch([
      db.update(clients).set({ balance: client.balance - 1 }).where(and(eq(clients.id, client.id), eq(clients.organizationId, access.organizationId))),
      db.insert(dailyRecords).values({ organizationId: access.organizationId, occurredAt: input.occurredAt, clientName: client.name, barberId: barber.id, serviceId: service.id, paymentMethodId: payment.id, quantity: 1, valueCents: 0, commissionRateBps: 0, commissionCents: payout, tipCents, feeCents: 0, origin: "Assinatura", recordType: "Mensalista", membershipClientId: client.id }).returning({ id: dailyRecords.id }),
    ]);
    const recordId = inserted[0]?.id;
    if (input.productItems?.length) {
      if (!recordId) throw new Error("Não foi possível vincular os produtos ao atendimento.");
      try {
        await registerProductSaleBundle(access, { occurredAt: input.occurredAt, clientName: client.name, sellerTeamMemberId: barber.id, paymentMethodId: payment.id, items: input.productItems, dailyRecordId: recordId });
      } catch (error) {
        await db.batch([
          db.delete(dailyRecords).where(and(eq(dailyRecords.id, recordId), eq(dailyRecords.organizationId, access.organizationId))),
          db.update(clients).set({ balance: sql`${clients.balance} + 1` }).where(and(eq(clients.id, client.id), eq(clients.organizationId, access.organizationId))),
        ]);
        throw error;
      }
    }
    if (recordId) await notifyOwnersOfAttendance(access, { recordId, clientName: client.name, serviceName: service.name, recordType: "Mensalista", valueCents: 0 });
    return;
  }
  const payment = (await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId ?? 0), eq(paymentMethods.organizationId, access.organizationId))).limit(1))[0];
  if (!payment) throw new Error("Escolha a forma de pagamento.");
  const service = (await db.select().from(services).where(and(eq(services.id, input.serviceId ?? 0), eq(services.organizationId, access.organizationId), isNull(services.deletedAt))).limit(1))[0];
  if (!service) throw new Error("Informe cliente e serviço.");
  const clientName = validClientName(input.clientName ?? "", 120);
  const valueCents = service.priceCents;
  const inserted = await db.insert(dailyRecords).values({ organizationId: access.organizationId, occurredAt: input.occurredAt, clientName, barberId: barber.id, serviceId: service.id, paymentMethodId: payment.id, quantity: 1, valueCents, commissionRateBps: barber.commissionRateBps, commissionCents: Math.round(valueCents * barber.commissionRateBps / 10000), tipCents, feeCents: Math.round(valueCents * payment.feeBps / 10000), origin: input.origin ?? "Retorno", recordType: "Avulso", membershipClientId: null }).returning({ id: dailyRecords.id });
  const recordId = inserted[0]?.id;
  if (input.productItems?.length) {
    if (!recordId) throw new Error("Não foi possível vincular os produtos ao atendimento.");
    try {
      await registerProductSaleBundle(access, { occurredAt: input.occurredAt, clientName, sellerTeamMemberId: barber.id, paymentMethodId: payment.id, items: input.productItems, dailyRecordId: recordId });
    } catch (error) {
      await db.delete(dailyRecords).where(and(eq(dailyRecords.id, recordId), eq(dailyRecords.organizationId, access.organizationId)));
      throw error;
    }
  }
  if (recordId) await notifyOwnersOfAttendance(access, { recordId, clientName, serviceName: service.name, recordType: "Avulso", valueCents });
}

export async function updateDailyRecord(access: AccessContext, input: { id: number; occurredAt: string; clientName?: string; membershipClientId?: number; barberId: number; serviceId?: number; paymentMethodId?: number; origin?: string; tipCents?: number; productItems?: EditableProductSaleItemInput[] }) {
  const tipCents = validTipCents(input.tipCents);
  const db = await getDb();
  const existing = (await db.select().from(dailyRecords).where(and(eq(dailyRecords.id, input.id), eq(dailyRecords.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Atendimento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  requireOwnBarber(access, input.barberId);
  const barber = (await db.select().from(team).where(and(eq(team.id, input.barberId), eq(team.organizationId, access.organizationId))).limit(1))[0];
  if (!barber) throw new Error("Escolha o barbeiro.");

  if (existing.recordType === "Mensalista") {
    const clientId = input.membershipClientId ?? existing.membershipClientId ?? 0;
    const client = (await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, access.organizationId))).limit(1))[0];
    if (!client) throw new Error("Escolha o mensalista.");
    const paymentList = await db.select().from(paymentMethods).where(eq(paymentMethods.organizationId, access.organizationId)).orderBy(paymentMethods.id);
    const selectedPayment = paymentList.find((item) => item.id === input.paymentMethodId);
    const payment = input.productItems?.length
      ? selectedPayment
      : paymentList.find((item) => item.id === client.paymentMethodId) ?? paymentList.find((item) => item.id === existing.paymentMethodId) ?? paymentList[0];
    if (!payment) throw new Error(input.productItems?.length ? "Escolha como os produtos foram pagos." : "Cadastre uma forma de pagamento antes de editar o uso.");
    const plan = (await db.select().from(plans).where(and(eq(plans.id, client.planId), eq(plans.organizationId, access.organizationId))).limit(1))[0];
    const serviceList = await db.select().from(services).where(eq(services.organizationId, access.organizationId));
    const service = serviceList.find((item) => item.name.toLowerCase() === (plan?.planKind ?? client.planKind).toLowerCase()) ?? serviceList[0];
    if (!service) throw new Error("Cadastre o serviço do plano.");
    const payout = membershipPayoutCentsForAccessRole(barber.accessRole, plan?.barberPayoutCents, client.planKind);
    if (existing.membershipClientId && existing.membershipClientId !== client.id) {
      await db.update(clients).set({ balance: sql`${clients.balance} + ${existing.quantity}` }).where(and(eq(clients.id, existing.membershipClientId), eq(clients.organizationId, access.organizationId)));
      await db.update(clients).set({ balance: sql`${clients.balance} - ${existing.quantity}` }).where(and(eq(clients.id, client.id), eq(clients.organizationId, access.organizationId)));
    }
    await db.update(dailyRecords).set({ occurredAt: input.occurredAt, clientName: client.name, barberId: barber.id, serviceId: service.id, paymentMethodId: payment.id, valueCents: 0, commissionRateBps: 0, commissionCents: payout, tipCents, feeCents: 0, origin: "Assinatura", membershipClientId: client.id }).where(and(eq(dailyRecords.id, input.id), eq(dailyRecords.organizationId, access.organizationId)));
    const productSaleContext = { dailyRecordId: input.id, occurredAt: input.occurredAt, clientName: client.name, sellerTeamMemberId: barber.id, paymentMethodId: payment.id };
    if (input.productItems) await replaceProductSalesForDailyRecord(access, { ...productSaleContext, items: input.productItems });
    else await syncProductSalesForDailyRecord(access, productSaleContext);
    return;
  }

  const payment = (await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId ?? 0), eq(paymentMethods.organizationId, access.organizationId))).limit(1))[0];
  if (!payment) throw new Error("Escolha a forma de pagamento.");
  const service = (await db.select().from(services).where(and(eq(services.id, input.serviceId ?? existing.serviceId), eq(services.organizationId, access.organizationId))).limit(1))[0];
  if (!service) throw new Error("Informe cliente e serviço.");
  const clientName = validClientName(input.clientName ?? "", 120);
  const valueCents = service.priceCents;
  await db.update(dailyRecords).set({ occurredAt: input.occurredAt, clientName, barberId: barber.id, serviceId: service.id, paymentMethodId: payment.id, valueCents, commissionRateBps: barber.commissionRateBps, commissionCents: Math.round(valueCents * barber.commissionRateBps / 10000), tipCents, feeCents: Math.round(valueCents * payment.feeBps / 10000), origin: input.origin ?? "Retorno" }).where(and(eq(dailyRecords.id, input.id), eq(dailyRecords.organizationId, access.organizationId)));
  const productSaleContext = { dailyRecordId: input.id, occurredAt: input.occurredAt, clientName, sellerTeamMemberId: barber.id, paymentMethodId: payment.id };
  if (input.productItems) await replaceProductSalesForDailyRecord(access, { ...productSaleContext, items: input.productItems });
  else await syncProductSalesForDailyRecord(access, productSaleContext);
}

export async function deleteDailyRecord(access: AccessContext, id: number) {
  const db = await getDb();
  const existing = (await db.select().from(dailyRecords).where(and(eq(dailyRecords.id, id), eq(dailyRecords.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Atendimento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  await deleteProductSalesForDailyRecord(access, id);
  if (existing.recordType === "Mensalista" && existing.membershipClientId) await db.update(clients).set({ balance: sql`${clients.balance} + ${existing.quantity}` }).where(and(eq(clients.id, existing.membershipClientId), eq(clients.organizationId, access.organizationId)));
  await db.delete(dailyRecords).where(and(eq(dailyRecords.id, id), eq(dailyRecords.organizationId, access.organizationId)));
}

export async function registerAttendance(access: AccessContext, clientId: number, barberId: number) { await createDailyRecord(access, { occurredAt: appDate(), recordType: "Mensalista", membershipClientId: clientId, barberId }); }
export async function renewClient(access: AccessContext, clientId: number) {
  requireOwner(access);
  const db = await getDb();
  const client = (await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, access.organizationId), isNull(clients.deletedAt))).limit(1))[0];
  if (!client) throw new Error("Cliente não encontrado.");
  const plan = (await db.select().from(plans).where(and(eq(plans.id, client.planId), eq(plans.organizationId, access.organizationId))).limit(1))[0];
  const payment = (await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, client.paymentMethodId), eq(paymentMethods.organizationId, access.organizationId))).limit(1))[0];
  const today = appDate();
  const renewal = membershipRenewalDates(client.dueDate, today);
  const paidMonth = renewal.paidMonth;
  await db.update(clients).set({ balance: plan?.maxUses ?? client.maxBalance, maxBalance: plan?.maxUses ?? client.maxBalance, status: "Ativo", paidMonth, dueDate: renewal.dueDate }).where(and(eq(clients.id, clientId), eq(clients.organizationId, access.organizationId), isNull(clients.deletedAt)));
  await upsertMembershipPaymentSnapshot({ organizationId: access.organizationId, clientId: client.id, clientName: client.name, planName: plan?.name ?? client.plan, planKind: plan?.planKind ?? client.planKind, paymentMethodId: client.paymentMethodId, paymentName: payment?.name ?? "Não informado", paidMonth, occurredAt: today, amountCents: plan?.monthlyValueCents ?? client.monthlyValueCents, paymentFeeBps: payment?.feeBps ?? 0 });
}
export async function saveExpense(access: AccessContext, input: { id?: number; occurredAt: string; type: string; description: string; valueCents: number; paid: boolean }) { requireOwner(access); if (!input.description.trim() || input.valueCents <= 0) throw new Error("Informe a despesa e o valor."); const db = await getDb(); const values = { occurredAt: input.occurredAt, type: input.type, description: input.description.trim(), valueCents: input.valueCents, paid: input.paid }; if (input.id) await db.update(expenses).set(values).where(and(eq(expenses.id, input.id), eq(expenses.organizationId, access.organizationId))); else await db.insert(expenses).values({ ...values, organizationId: access.organizationId }); }
export async function deleteExpense(access: AccessContext, id: number) { requireOwner(access); const db = await getDb(); const existing = (await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.organizationId, access.organizationId))).limit(1))[0]; if (!existing) throw new Error("Despesa não encontrada."); await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.organizationId, access.organizationId))); }

export async function saveAppointment(access: AccessContext, input: { id?: number; appointmentDate: string; appointmentTime: string; clientName: string; phone?: string; serviceId: number; barberId: number; notes?: string }) {
  if (!input.appointmentDate || !input.appointmentTime) throw new Error("Informe cliente, data e horário.");
  const clientName = validClientName(input.clientName, 120);
  requireOwnBarber(access, input.barberId);
  const db = await getDb();
  const existing = input.id ? (await db.select().from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId))).limit(1))[0] : undefined;
  if (input.id && !existing) throw new Error("Agendamento não encontrado.");
  if (existing) requireOwnBarber(access, existing.barberId);
  const barber = (await db.select().from(team).where(and(eq(team.id, input.barberId), eq(team.organizationId, access.organizationId))).limit(1))[0];
  const service = (await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.organizationId, access.organizationId))).limit(1))[0];
  if (!barber || !service || (service.deletedAt && service.id !== existing?.serviceId)) throw new Error("Escolha barbeiro e serviço.");
  const organization = (await db.select().from(organizations).where(eq(organizations.id, access.organizationId)).limit(1))[0];
  const toMinutes = (value: string) => { const match = /^(\d{2}):(\d{2})$/.exec(value); if (!match) return Number.NaN; return Number(match[1]) * 60 + Number(match[2]); };
  const startMinutes = toMinutes(input.appointmentTime);
  if (!Number.isFinite(startMinutes)) throw new Error("Informe um horário válido.");
  const agendaRows = await db.select({ id: appointments.id, clientName: appointments.clientName, status: appointments.status, appointmentTime: appointments.appointmentTime, durationMinutes: services.durationMinutes }).from(appointments).innerJoin(services, eq(appointments.serviceId, services.id)).where(and(eq(appointments.organizationId, access.organizationId), eq(appointments.appointmentDate, input.appointmentDate), eq(appointments.barberId, input.barberId)));
  const intelligentAgenda = organization?.useServiceDurationInAgenda ?? false;
  const endMinutes = startMinutes + service.durationMinutes;
  if (intelligentAgenda) {
    const openingMinutes = toMinutes(organization?.openingTime ?? "08:00");
    const closingMinutes = toMinutes(organization?.closingTime ?? "19:00");
    if (startMinutes < openingMinutes || endMinutes > closingMinutes) throw new Error(`Escolha um horário entre ${organization?.openingTime ?? "08:00"} e ${organization?.closingTime ?? "19:00"}. Este serviço dura ${service.durationMinutes} minutos.`);
  }
  const conflict = agendaRows.find((item) => {
    if (item.id === input.id || item.status === "Cancelado") return false;
    const existingStart = toMinutes(item.appointmentTime);
    return intelligentAgenda ? startMinutes < existingStart + item.durationMinutes && endMinutes > existingStart : existingStart === startMinutes;
  });
  if (conflict) throw new Error(intelligentAgenda ? `Este horário se sobrepõe ao atendimento de ${conflict.clientName}. Escolha outro horário.` : `Não é possível agendar: ${barber.name} já atende ${conflict.clientName} nesse dia e horário.`);
  const values = { appointmentDate: input.appointmentDate, appointmentTime: input.appointmentTime, clientName, phone: input.phone ?? "", serviceId: input.serviceId, barberId: input.barberId, notes: input.notes ?? "", status: "Agendado", reminderSentAt: null };
  if (input.id) {
    await db.update(appointments).set(values).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId)));
  } else await db.insert(appointments).values({ ...values, organizationId: access.organizationId });
}

export async function cancelAppointment(access: AccessContext, id: number) {
  const db = await getDb();
  const existing = (await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Agendamento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  if (existing.status === "Cancelado") return;
  await db.update(appointments).set({ status: "Cancelado" }).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId)));
  await notifyOwnersOfAppointmentCancellation(access, {
    appointmentId: existing.id,
    clientName: existing.clientName,
    date: existing.appointmentDate,
    time: existing.appointmentTime,
  });
}
export async function confirmAppointment(access: AccessContext, id: number) { requireOwner(access); const db = await getDb(); const existing = (await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))).limit(1))[0]; if (!existing) throw new Error("Agendamento não encontrado."); if (existing.status !== "Aguardando") return; await db.update(appointments).set({ status: "Agendado" }).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))); }
export async function completeAppointment(access: AccessContext, input: { id: number; occurredAt: string; paymentMethodId: number; membershipClientId?: number; tipCents?: number }) {
  const db = await getDb();
  const appointment = (await db.select().from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId))).limit(1))[0];
  if (!appointment) throw new Error("Agendamento não encontrado.");
  requireOwnBarber(access, appointment.barberId);
  if (appointment.status === "Cancelado") throw new Error("Não é possível concluir um agendamento cancelado.");
  if (appointment.status === "Atendido") throw new Error("Este atendimento já foi concluído.");
  if (appointment.paymentChoice === "Mensalista") {
    if (!input.membershipClientId) throw new Error("Escolha o cadastro do mensalista antes de concluir.");
    await createDailyRecord(access, { occurredAt: input.occurredAt || appointment.appointmentDate, recordType: "Mensalista", membershipClientId: input.membershipClientId, barberId: appointment.barberId, serviceId: appointment.serviceId, paymentMethodId: input.paymentMethodId, origin: "Assinatura", tipCents: input.tipCents ?? 0 });
  } else {
    await createDailyRecord(access, { occurredAt: input.occurredAt || appointment.appointmentDate, recordType: "Avulso", clientName: appointment.clientName, barberId: appointment.barberId, serviceId: appointment.serviceId, paymentMethodId: input.paymentMethodId, origin: "Agendamento", tipCents: input.tipCents ?? 0 });
  }
  await db.update(appointments).set({ status: "Atendido" }).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, access.organizationId)));
}
export async function markAppointmentReminderSent(access: AccessContext, id: number) { const db = await getDb(); const existing = (await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))).limit(1))[0]; if (!existing) throw new Error("Agendamento não encontrado."); requireOwnBarber(access, existing.barberId); if (existing.status !== "Agendado") throw new Error("Confirme o agendamento antes de enviar o lembrete."); await db.update(appointments).set({ reminderSentAt: new Date().toISOString() }).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))); }
export async function deleteAppointment(access: AccessContext, id: number) { const db = await getDb(); const existing = (await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))).limit(1))[0]; if (!existing) throw new Error("Agendamento não encontrado."); requireOwnBarber(access, existing.barberId); await db.delete(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, access.organizationId))); }

export async function savePlan(access: AccessContext, input: { id?: number; name: string; planKind: string; monthlyValueCents: number; maxUses: number; barberPayoutCents: number; active: boolean }) { requireOwner(access); if (!input.name.trim() || input.monthlyValueCents < 0 || input.maxUses < 1) throw new Error("Preencha os dados do plano."); const db = await getDb(); const values = { name: input.name.trim(), planKind: input.planKind.trim(), monthlyValueCents: input.monthlyValueCents, maxUses: input.maxUses, barberPayoutCents: input.barberPayoutCents, active: input.active }; if (input.id) { await db.update(plans).set(values).where(and(eq(plans.id, input.id), eq(plans.organizationId, access.organizationId))); await db.update(clients).set({ plan: values.name, planKind: values.planKind, monthlyValueCents: values.monthlyValueCents, maxBalance: values.maxUses }).where(and(eq(clients.planId, input.id), eq(clients.organizationId, access.organizationId))); } else await db.insert(plans).values({ ...values, organizationId: access.organizationId }); }
export async function deletePlan(access: AccessContext, id: number) { requireOwner(access); const db = await getDb(); const plan = (await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.organizationId, access.organizationId))).limit(1))[0]; if (!plan) throw new Error("Plano não encontrado."); const linkedClients = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.organizationId, access.organizationId), eq(clients.planId, plan.id), isNull(clients.deletedAt))).limit(1); if (linkedClients.length) throw new Error("Este plano ainda está ligado a clientes mensalistas. Altere o plano desses clientes antes de excluir."); await db.delete(plans).where(and(eq(plans.id, plan.id), eq(plans.organizationId, access.organizationId))); }
export async function saveClient(access: AccessContext, input: { id?: number; name: string; phone: string; planId: number; paymentMethodId: number; status: string; dueDate: string; paidMonth: string }) {
  requireOwner(access);
  const clientName = validClientName(input.name, 120);
  const db = await getDb();
  const plan = (await db.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.organizationId, access.organizationId))).limit(1))[0];
  const payment = (await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.organizationId, access.organizationId))).limit(1))[0];
  if (!plan || !payment) throw new Error("Informe nome, plano e como a mensalidade foi paga.");
  if (!/^\d{4}-\d{2}$/.test(input.paidMonth)) throw new Error("Informe o mês pago.");
  const values = { name: clientName, phone: input.phone.trim(), plan: plan.name, planKind: plan.planKind, planId: plan.id, paymentMethodId: payment.id, maxBalance: plan.maxUses, monthlyValueCents: plan.monthlyValueCents, status: input.status, dueDate: input.dueDate, paidMonth: input.paidMonth };
  let clientId: number;
  if (input.id) {
    const [updated] = await db.update(clients).set(values).where(and(eq(clients.id, input.id), eq(clients.organizationId, access.organizationId), isNull(clients.deletedAt))).returning({ id: clients.id });
    if (!updated) throw new Error("Mensalista não encontrado.");
    clientId = updated.id;
  } else {
    const [created] = await db.insert(clients).values({ ...values, organizationId: access.organizationId, balance: plan.maxUses }).returning({ id: clients.id });
    if (!created) throw new Error("Não foi possível cadastrar o mensalista.");
    clientId = created.id;
  }
  if (input.status === "Ativo") await upsertMembershipPaymentSnapshot({ organizationId: access.organizationId, clientId, clientName: values.name, planName: plan.name, planKind: plan.planKind, paymentMethodId: payment.id, paymentName: payment.name, paidMonth: input.paidMonth, occurredAt: appDate(), amountCents: plan.monthlyValueCents, paymentFeeBps: payment.feeBps });
}
export async function deleteClient(access: AccessContext, id: number) { requireOwner(access); const db = await getDb(); const now = new Date().toISOString(); const updated = await db.update(clients).set({ status: "Bloqueado", deletedAt: now }).where(and(eq(clients.id, id), eq(clients.organizationId, access.organizationId), isNull(clients.deletedAt))).returning({ id: clients.id }); if (!updated.length) throw new Error("Mensalista não encontrado."); }
export async function deleteMembershipPayment(access: AccessContext, id: number) { requireOwner(access); const db = await getDb(); const deleted = await db.delete(membershipPayments).where(and(eq(membershipPayments.id, id), eq(membershipPayments.organizationId, access.organizationId))).returning({ id: membershipPayments.id }); if (!deleted.length) throw new Error("Lançamento mensal não encontrado."); }
export async function saveService(access: AccessContext, input: { id?: number; name: string; priceCents: number; durationMinutes: number; active: boolean }) { requireOwner(access); if (!input.name.trim() || input.priceCents < 0 || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480) throw new Error("Informe serviço, preço e duração entre 5 e 480 minutos."); const db = await getDb(); const values = { name: input.name.trim(), priceCents: input.priceCents, durationMinutes: input.durationMinutes, active: input.active }; if (input.id) { const updated = await db.update(services).set(values).where(and(eq(services.id, input.id), eq(services.organizationId, access.organizationId), isNull(services.deletedAt))).returning({ id: services.id }); if (!updated.length) throw new Error("Serviço não encontrado."); } else await db.insert(services).values({ ...values, organizationId: access.organizationId }); }
export async function deleteService(access: AccessContext, id: number) { requireOwner(access); const db = await getDb(); const service = (await db.select().from(services).where(and(eq(services.id, id), eq(services.organizationId, access.organizationId), isNull(services.deletedAt))).limit(1))[0]; if (!service) throw new Error("Serviço não encontrado."); const activePlans = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.organizationId, access.organizationId), eq(plans.active, true), sql`lower(${plans.planKind}) = lower(${service.name})`)).limit(1); if (activePlans.length) throw new Error("Este serviço está ligado a um plano mensalista ativo. Altere ou desative o plano antes de excluir."); await db.update(services).set({ active: false, deletedAt: new Date().toISOString() }).where(and(eq(services.id, id), eq(services.organizationId, access.organizationId), isNull(services.deletedAt))); }
export async function saveAgendaSettings(access: AccessContext, input: { useServiceDuration: boolean; openingTime: string; closingTime: string; publicBookingEnabled?: boolean; publicBookingRequiresApproval?: boolean; publicBookingWeekdays?: number[] }) {
  requireOwner(access);
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(input.openingTime) || !timePattern.test(input.closingTime) || input.openingTime >= input.closingTime) throw new Error("Informe um horário de abertura e fechamento válido.");
  const weekdays = input.publicBookingWeekdays === undefined ? undefined : serializeBookingWeekdays(input.publicBookingWeekdays);
  if (weekdays === "") throw new Error("Escolha pelo menos um dia de atendimento público.");
  const db = await getDb();
  const values: { useServiceDurationInAgenda: boolean; openingTime: string; closingTime: string; publicBookingEnabled?: boolean; publicBookingRequiresApproval?: boolean; publicBookingWeekdays?: string } = { useServiceDurationInAgenda: input.useServiceDuration, openingTime: input.openingTime, closingTime: input.closingTime };
  if (typeof input.publicBookingEnabled === "boolean") values.publicBookingEnabled = input.publicBookingEnabled;
  if (typeof input.publicBookingRequiresApproval === "boolean") values.publicBookingRequiresApproval = input.publicBookingRequiresApproval;
  if (weekdays !== undefined) values.publicBookingWeekdays = weekdays;
  await db.update(organizations).set(values).where(eq(organizations.id, access.organizationId));
}
export async function savePayment(access: AccessContext, input: { id?: number; name: string; feeBps: number }) { requireOwner(access); if (!input.name.trim() || input.feeBps < 0) throw new Error("Informe pagamento e taxa."); const db = await getDb(); const values = { name: input.name.trim(), feeBps: input.feeBps }; if (input.id) await db.update(paymentMethods).set(values).where(and(eq(paymentMethods.id, input.id), eq(paymentMethods.organizationId, access.organizationId))); else await db.insert(paymentMethods).values({ ...values, organizationId: access.organizationId }); }
export async function saveTeamMember(access: AccessContext, input: { id?: number; name: string; role: string; loginEmail?: string; accessRole?: string; commissionRateBps: number; active: boolean }) {
  requireOwner(access);
  if (!input.name.trim() || input.commissionRateBps < 0) throw new Error("Informe o profissional e a comissão.");
  const db = await getDb();
  const requestedEmail = input.loginEmail?.trim().toLowerCase() || null;
  if (requestedEmail && !requestedEmail.includes("@")) throw new Error("Informe um e-mail de acesso válido.");
  const members = await db.select().from(team).where(eq(team.organizationId, access.organizationId));
  if (requestedEmail && members.some((member) => member.id !== input.id && member.loginEmail?.toLowerCase() === requestedEmail)) throw new Error("Este e-mail já está ligado a outro profissional.");
  const isSelf = input.id === access.teamMemberId;
  const values = {
    name: input.name.trim(),
    role: input.role.trim(),
    loginEmail: isSelf ? access.email : requestedEmail,
    accessRole: isSelf ? "owner" : input.accessRole === "owner" ? "owner" : "barber",
    commissionRateBps: input.commissionRateBps,
    active: isSelf ? true : input.active,
    commissionCents: 0,
  };
  if (input.id) {
    await db.update(team).set(values).where(and(eq(team.id, input.id), eq(team.organizationId, access.organizationId)));
    await syncTeamAccount(input.id, values.loginEmail, values.active);
  } else {
    await db.insert(team).values({ ...values, organizationId: access.organizationId });
  }
}
export async function saveGoal(access: AccessContext, input: { revenueCents: number; grossProfitCents: number; expenseCents: number; netProfitCents: number; attendanceTarget: number }) { requireOwner(access); const db = await getDb(); const month = appMonth(); const existing = (await db.select().from(goals).where(and(eq(goals.organizationId, access.organizationId), eq(goals.month, month))).limit(1))[0]; const values = { ...input, month }; if (existing) await db.update(goals).set(values).where(and(eq(goals.id, existing.id), eq(goals.organizationId, access.organizationId), eq(goals.month, month))); else await db.insert(goals).values({ ...values, organizationId: access.organizationId }); }
