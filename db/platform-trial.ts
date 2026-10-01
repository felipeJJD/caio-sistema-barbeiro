import { eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AccessContext } from "./access";
import { requirePlatformAdmin } from "./access";
import { getDb } from "./index";

export const DEFAULT_PUBLIC_TRIAL_DAYS = 14;
export const MAX_PUBLIC_TRIAL_DAYS = 3650;

const platformTrialSettings = sqliteTable("platform_trial_settings", {
  id: integer("id").primaryKey().default(1),
  trialDays: integer("trial_days").notNull().default(DEFAULT_PUBLIC_TRIAL_DAYS),
  updatedByTeamMemberId: integer("updated_by_team_member_id"),
  updatedAt: text("updated_at").notNull(),
});

function validTrialDays(value: unknown) {
  const days = Math.round(Number(value));
  if (!Number.isInteger(days) || days < 1 || days > MAX_PUBLIC_TRIAL_DAYS) {
    throw new Error(`Informe um teste entre 1 e ${MAX_PUBLIC_TRIAL_DAYS} dias.`);
  }
  return days;
}

export async function getPlatformTrialDays() {
  const db = await getDb();
  const row = (await db.select({ trialDays: platformTrialSettings.trialDays })
    .from(platformTrialSettings)
    .where(eq(platformTrialSettings.id, 1))
    .limit(1))[0];
  return row ? validTrialDays(row.trialDays) : DEFAULT_PUBLIC_TRIAL_DAYS;
}

export async function savePlatformTrialDays(access: AccessContext, value: unknown) {
  requirePlatformAdmin(access);
  const trialDays = validTrialDays(value);
  const now = new Date().toISOString();
  const db = await getDb();
  await db.insert(platformTrialSettings).values({
    id: 1,
    trialDays,
    updatedByTeamMemberId: access.teamMemberId,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: platformTrialSettings.id,
    set: { trialDays, updatedByTeamMemberId: access.teamMemberId, updatedAt: now },
  });
  return trialDays;
}
