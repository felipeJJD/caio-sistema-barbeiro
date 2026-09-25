import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { appDate, shiftAppMonth } from "../lib/app-date";
import {
  buildClientFrequency,
  buildDormantClients,
  buildFinanceMonths,
  type BusinessInsights,
  type BusinessInsightAttendance,
} from "../lib/business-insights";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { appointments, clients, dailyRecords, membershipPayments, productSales, services, team } from "./schema";

export async function getBusinessInsights(access: AccessContext): Promise<BusinessInsights> {
  requireOwner(access);
  const db = await getDb();
  const today = appDate();
  const financeStart = `${shiftAppMonth(today, -11)}-01`;
  const dormantStart = appDate(new Date(), -540);
  const recordsStart = dormantStart < financeStart ? dormantStart : financeStart;

  const [recordRows, appointmentRows, membershipClientRows, membershipRows, productRows, serviceRows, teamRows] = await Promise.all([
    db.select({
      occurredAt: dailyRecords.occurredAt,
      clientName: dailyRecords.clientName,
      quantity: dailyRecords.quantity,
      valueCents: dailyRecords.valueCents,
      tipCents: dailyRecords.tipCents,
      serviceId: dailyRecords.serviceId,
      barberId: dailyRecords.barberId,
    }).from(dailyRecords).where(and(
      eq(dailyRecords.organizationId, access.organizationId),
      gte(dailyRecords.occurredAt, recordsStart),
      lte(dailyRecords.occurredAt, today),
    )),
    db.select({
      appointmentDate: appointments.appointmentDate,
      clientName: appointments.clientName,
      phone: appointments.phone,
    }).from(appointments).where(and(
      eq(appointments.organizationId, access.organizationId),
      gte(appointments.appointmentDate, dormantStart),
      lte(appointments.appointmentDate, today),
    )),
    db.select({ name: clients.name, phone: clients.phone }).from(clients).where(and(
      eq(clients.organizationId, access.organizationId),
      isNull(clients.deletedAt),
    )),
    db.select({ occurredAt: membershipPayments.occurredAt, valueCents: membershipPayments.amountCents }).from(membershipPayments).where(and(
      eq(membershipPayments.organizationId, access.organizationId),
      gte(membershipPayments.occurredAt, financeStart),
      lte(membershipPayments.occurredAt, today),
    )),
    db.select({ occurredAt: productSales.occurredAt, unitPriceCents: productSales.unitPriceCents, quantity: productSales.quantity }).from(productSales).where(and(
      eq(productSales.organizationId, access.organizationId),
      gte(productSales.occurredAt, financeStart),
      lte(productSales.occurredAt, today),
    )),
    db.select({ id: services.id, name: services.name }).from(services).where(eq(services.organizationId, access.organizationId)),
    db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, access.organizationId)),
  ]);

  const serviceNames = new Map(serviceRows.map((row) => [row.id, row.name]));
  const barberNames = new Map(teamRows.map((row) => [row.id, row.name]));
  const attendances: BusinessInsightAttendance[] = recordRows.map((row) => ({
    occurredAt: row.occurredAt,
    clientName: row.clientName,
    quantity: row.quantity,
    valueCents: row.valueCents,
    tipCents: row.tipCents,
    serviceName: serviceNames.get(row.serviceId) ?? "Serviço",
    barberName: barberNames.get(row.barberId) ?? "Profissional",
  }));

  const clientRadar = {
    "30": buildClientFrequency({ attendances, today, days: 30 }),
    "90": buildClientFrequency({ attendances, today, days: 90 }),
    "180": buildClientFrequency({ attendances, today, days: 180 }),
    "365": buildClientFrequency({ attendances, today, days: 365 }),
  };
  const dormantClients = buildDormantClients({
    attendances,
    appointments: appointmentRows,
    membershipClients: membershipClientRows,
    today,
  });
  const financeMonths = buildFinanceMonths({
    attendances,
    membershipPayments: membershipRows,
    productSales: productRows.map((row) => ({
      occurredAt: row.occurredAt,
      valueCents: Number(row.unitPriceCents || 0) * Math.max(1, Number(row.quantity || 1)),
    })),
    today,
    monthCount: 12,
  });

  return {
    generatedAt: today,
    clientRadar: { periods: clientRadar },
    dormant: {
      total: dormantClients.length,
      buckets: {
        days30to44: dormantClients.filter((client) => client.bucket === "30-44").length,
        days45to59: dormantClients.filter((client) => client.bucket === "45-59").length,
        days60plus: dormantClients.filter((client) => client.bucket === "60+").length,
      },
      estimatedValueCents: dormantClients.reduce((sum, client) => sum + client.estimatedValueCents, 0),
      clients: dormantClients.slice(0, 30),
    },
    financeMonths,
  };
}
