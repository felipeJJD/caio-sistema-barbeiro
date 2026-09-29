import { eq } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { platformBillingSettings } from "./schema";

export type PixPlanCode = "monthly" | "quarterly" | "semiannual" | "annual";

export type PixPlanOffer = {
  code: PixPlanCode;
  label: string;
  months: number;
  periodDays: number;
  priceCents: number;
  discountBps: number;
};

export type PlatformBillingOffer = {
  pixPriceCents: number;
  barberPixPriceCents: number;
  pixPeriodDays: number;
  quarterlyDiscountBps: number;
  semiannualDiscountBps: number;
  annualDiscountBps: number;
  pixPlans: PixPlanOffer[];
  barberPixPlans: PixPlanOffer[];
};

type StoredOffer = Omit<PlatformBillingOffer, "pixPlans" | "barberPixPlans">;

const DEFAULT_OFFER: StoredOffer = {
  pixPriceCents: 3990,
  barberPixPriceCents: 3990,
  pixPeriodDays: 30,
  quarterlyDiscountBps: 1000,
  semiannualDiscountBps: 1500,
  annualDiscountBps: 2000,
};

export function withPlans(offer: StoredOffer): PlatformBillingOffer {
  return {
    ...offer,
    barberPixPriceCents: offer.pixPriceCents,
    pixPlans: [
      { code: "monthly", label: "Mensal", months: 1, periodDays: offer.pixPeriodDays, priceCents: offer.pixPriceCents, discountBps: 0 },
    ],
    barberPixPlans: [
      { code: "monthly", label: "Mensal", months: 1, periodDays: offer.pixPeriodDays, priceCents: offer.pixPriceCents, discountBps: 0 },
    ],
  };
}

export function getPixPlan(offer: PlatformBillingOffer) {
  return offer.pixPlans[0];
}

export async function getPlatformBillingOffer(): Promise<PlatformBillingOffer> {
  const db = await getDb();
  const row = (await db.select().from(platformBillingSettings).where(eq(platformBillingSettings.id, 1)).limit(1))[0];
  return withPlans(row ? {
    pixPriceCents: row.pixPriceCents,
    barberPixPriceCents: row.barberPixPriceCents,
    pixPeriodDays: row.pixPeriodDays,
    quarterlyDiscountBps: row.quarterlyDiscountBps,
    semiannualDiscountBps: row.semiannualDiscountBps,
    annualDiscountBps: row.annualDiscountBps,
  } : DEFAULT_OFFER);
}

export async function savePlatformBillingOffer(access: AccessContext, input: {
  pixPriceCents: number;
}) {
  requirePlatformAdmin(access);
  const pixPriceCents = Math.round(Number(input.pixPriceCents));
  if (!Number.isInteger(pixPriceCents) || pixPriceCents < 100 || pixPriceCents > 1000000) {
    throw new Error("Informe um preço Pix entre R$ 1,00 e R$ 10.000,00.");
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.insert(platformBillingSettings).values({
    id: 1,
    pixPriceCents,
    barberPixPriceCents: pixPriceCents,
    pixPeriodDays: DEFAULT_OFFER.pixPeriodDays,
    quarterlyDiscountBps: 0,
    semiannualDiscountBps: 0,
    annualDiscountBps: 0,
    updatedByTeamMemberId: access.teamMemberId,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: platformBillingSettings.id,
    set: { pixPriceCents, barberPixPriceCents: pixPriceCents, updatedByTeamMemberId: access.teamMemberId, updatedAt: now },
  });
  return getPlatformBillingOffer();
}
