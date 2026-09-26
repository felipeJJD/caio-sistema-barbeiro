import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import type { AccessContext } from "./access";
import { getDb } from "./index";
import { dailyRecords, teamPaymentClosures } from "./schema";
import { appMonth } from "../lib/app-date";

export async function recalculateOpenOwnerAvulsoCommissions(access: AccessContext, commissionRateBps: number) {
  if (!access.isOwner || access.teamMemberId <= 0) return 0;

  const normalizedRate = Math.round(Number(commissionRateBps));
  if (!Number.isFinite(normalizedRate) || normalizedRate < 0 || normalizedRate > 10000) {
    throw new Error("Informe uma comissão válida entre 0% e 100%.");
  }

  const db = await getDb();
  const latestClosure = (await db.select({ lastDailyRecordId: teamPaymentClosures.lastDailyRecordId })
    .from(teamPaymentClosures)
    .where(and(
      eq(teamPaymentClosures.organizationId, access.organizationId),
      eq(teamPaymentClosures.teamMemberId, access.teamMemberId),
    ))
    .orderBy(desc(teamPaymentClosures.id))
    .limit(1))[0];

  const openPeriodCondition = latestClosure
    ? gt(dailyRecords.id, latestClosure.lastDailyRecordId)
    : gte(dailyRecords.occurredAt, `${appMonth()}-01`);

  const updated = await db.update(dailyRecords).set({
    commissionRateBps: normalizedRate,
    commissionCents: sql<number>`CAST(ROUND(${dailyRecords.valueCents} * ${normalizedRate} / 10000.0) AS INTEGER)`,
  }).where(and(
    eq(dailyRecords.organizationId, access.organizationId),
    eq(dailyRecords.barberId, access.teamMemberId),
    eq(dailyRecords.recordType, "Avulso"),
    openPeriodCondition,
  )).returning({ id: dailyRecords.id });

  return updated.length;
}
