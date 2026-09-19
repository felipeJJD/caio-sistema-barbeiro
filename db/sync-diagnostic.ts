import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./index";
import { dailyRecords, paymentMethods, services, team } from "./schema";
import { appDate } from "../lib/app-date";

/** Only SELECTs. The join and date predicates match the dashboard-period record query. */
export async function getOwnerSyncDiagnostic(organizationId: number) {
  const db = await getDb();
  const members = await db.select({ id: team.id, name: team.name, organizationId: team.organizationId })
    .from(team).where(eq(team.organizationId, organizationId));
  const barbers = members.filter((member) => ["davi", "eduardo"].includes(member.name.trim().toLowerCase()));
  const start = "2026-09-01";
  const end = appDate();
  const joined = await db.select({ id: dailyRecords.id, occurredAt: dailyRecords.occurredAt,
    barberId: dailyRecords.barberId })
    .from(dailyRecords)
    .innerJoin(team, eq(dailyRecords.barberId, team.id))
    .innerJoin(services, eq(dailyRecords.serviceId, services.id))
    .innerJoin(paymentMethods, eq(dailyRecords.paymentMethodId, paymentMethods.id))
    .where(and(eq(dailyRecords.organizationId, organizationId),
      gte(dailyRecords.occurredAt, start), lte(dailyRecords.occurredAt, end)))
    .orderBy(desc(dailyRecords.occurredAt), desc(dailyRecords.id));
  const deliveredIds = new Set(joined.map((record) => record.id));
  const comparisons = await Promise.all(barbers.map(async (barber) => {
    const latest = await db.select({ id: dailyRecords.id, occurredAt: dailyRecords.occurredAt,
      barberId: dailyRecords.barberId, serviceId: dailyRecords.serviceId, paymentMethodId: dailyRecords.paymentMethodId })
      .from(dailyRecords).where(and(eq(dailyRecords.organizationId, organizationId), eq(dailyRecords.barberId, barber.id)))
      .orderBy(desc(dailyRecords.occurredAt), desc(dailyRecords.id)).limit(10);
    const after12 = await db.select({ id: dailyRecords.id, occurredAt: dailyRecords.occurredAt,
      barberId: dailyRecords.barberId, serviceId: dailyRecords.serviceId, paymentMethodId: dailyRecords.paymentMethodId })
      .from(dailyRecords).where(and(eq(dailyRecords.organizationId, organizationId),
        eq(dailyRecords.barberId, barber.id), gte(dailyRecords.occurredAt, "2026-09-13")))
      .orderBy(desc(dailyRecords.occurredAt), desc(dailyRecords.id));
    const unselected = after12.filter((record) => !deliveredIds.has(record.id));
    const missing = await Promise.all(unselected.map(async (record) => {
      const [service, payment] = await Promise.all([
        db.select({ id: services.id }).from(services).where(eq(services.id, record.serviceId)).limit(1),
        db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.id, record.paymentMethodId)).limit(1),
      ]);
      return { id: record.id, reason: record.occurredAt < start || record.occurredAt > end ? "date-outside-period"
        : !service.length ? "service-join-missing" : !payment.length ? "payment-join-missing" : "requires-api-response-comparison" };
    }));
    return { barberId: barber.id, name: barber.name, latest10: latest.map(({ id, occurredAt, barberId }) => ({ id, occurredAt, barberId })),
      after12: after12.map(({ id, occurredAt, barberId }) => ({
        id, occurredAt, barberId, selectedByDashboardQuery: deliveredIds.has(id),
        ...(!deliveredIds.has(id) ? { reason: missing.find((row) => row.id === id)?.reason } : {}),
      })),
      latest10SelectedIds: latest.filter((record) => deliveredIds.has(record.id)).map((record) => record.id) };
  }));
  return { period: { start, end }, joinedCount: joined.length, barbers: comparisons };
}
