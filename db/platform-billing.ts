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
  pixPriceCents: 999,
  barberPixPriceCents: 999,
  pixPeriodDays: 30,
  quarterlyDiscountBps: 1000,
  semiannualDiscountBps: 1500,
  annualDiscountBps: 2000,
};

function discountedPrice(basePriceCents: number, months: number, discountBps: number) {
  return Math.round(basePriceCents * months * (10000 - discountBps) / 10000);
}

function withPlans(offer: StoredOffer): PlatformBillingOffer {
  return {
    ...offer,
    pixPlans: [
      { code: "monthly", label: "Mensal", months: 1, periodDays: offer.pixPeriodDays, priceCents: offer.pixPriceCents, discountBps: 0 },
      { code: "quarterly", label: "Trimestral", months: 3, periodDays: 90, priceCents: discountedPrice(offer.pixPriceCents, 3, offer.quarterlyDiscountBps), discountBps: offer.quarterlyDiscountBps },
      { code: "semiannual", label: "Semestral", months: 6, periodDays: 180, priceCents: discountedPrice(offer.pixPriceCents, 6, offer.semiannualDiscountBps), discountBps: offer.semiannualDiscountBps },
      { code: "annual", label: "Anual", months: 12, periodDays: 365, priceCents: discountedPrice(offer.pixPriceCents, 12, offer.annualDiscountBps), discountBps: offer.annualDiscountBps },
    ],
    barberPixPlans: [
      { code: "monthly", label: "Mensal", months: 1, periodDays: offer.pixPeriodDays, priceCents: offer.barberPixPriceCents, discountBps: 0 },
      { code: "quarterly", label: "Trimestral", months: 3, periodDays: 90, priceCents: discountedPrice(offer.barberPixPriceCents, 3, offer.quarterlyDiscountBps), discountBps: offer.quarterlyDiscountBps },
      { code: "semiannual", label: "Semestral", months: 6, periodDays: 180, priceCents: discountedPrice(offer.barberPixPriceCents, 6, offer.semiannualDiscountBps), discountBps: offer.semiannualDiscountBps },
      { code: "annual", label: "Anual", months: 12, periodDays: 365, priceCents: discountedPrice(offer.barberPixPriceCents, 12, offer.annualDiscountBps), discountBps: offer.annualDiscountBps },
    ],
  };
}

export function getPixPlan(offer: PlatformBillingOffer, planCode: string | null | undefined) {
  return offer.pixPlans.find((plan) => plan.code === planCode) ?? offer.pixPlans[0];
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
  barberPixPriceCents: number;
  quarterlyDiscountBps: number;
  semiannualDiscountBps: number;
  annualDiscountBps: number;
}) {
  requirePlatformAdmin(access);
  const pixPriceCents = Math.round(Number(input.pixPriceCents));
  const barberPixPriceCents = Math.round(Number(input.barberPixPriceCents));
  if (!Number.isInteger(pixPriceCents) || pixPriceCents < 100 || pixPriceCents > 1000000) {
    throw new Error("Informe um preço Pix entre R$ 1,00 e R$ 10.000,00.");
  }
  if (!Number.isInteger(barberPixPriceCents) || barberPixPriceCents < 100 || barberPixPriceCents > 1000000) {
    throw new Error("Informe o preço do barbeiro entre R$ 1,00 e R$ 10.000,00.");
  }
  const discounts = {
    quarterlyDiscountBps: Math.round(Number(input.quarterlyDiscountBps)),
    semiannualDiscountBps: Math.round(Number(input.semiannualDiscountBps)),
    annualDiscountBps: Math.round(Number(input.annualDiscountBps)),
  };
  if (Object.values(discounts).some((value) => !Number.isInteger(value) || value < 0 || value > 5000)) {
    throw new Error("Informe descontos entre 0% e 50%.");
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.insert(platformBillingSettings).values({
    id: 1,
    pixPriceCents,
    barberPixPriceCents,
    pixPeriodDays: DEFAULT_OFFER.pixPeriodDays,
    ...discounts,
    updatedByTeamMemberId: access.teamMemberId,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: platformBillingSettings.id,
    set: { pixPriceCents, barberPixPriceCents, ...discounts, updatedByTeamMemberId: access.teamMemberId, updatedAt: now },
  });
  return getPlatformBillingOffer();
}
