import { and, asc, eq, notExists } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AffiliateAccess } from "./affiliate-auth";
import { getDb } from "./index";
import { affiliateCommissions, affiliateLinks, affiliates, organizationReferrals, organizations, subscriptionPayments } from "./schema";
import { appMonth } from "../lib/app-date";

const PUBLIC_APP_URL = "https://cortouanotou.com.br";

const affiliateReferralArchives = sqliteTable("affiliate_referral_archives", {
  referralId: integer("referral_id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull(),
  archivedAt: text("archived_at").notNull(),
});

function cleanCode(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function cleanText(value: string, maximum: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function cleanPixKey(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
}

function currentMonth() {
  return appMonth();
}

function monthBounds(value?: string) {
  const month = /^\d{4}-\d{2}$/.test(value ?? "") ? String(value) : currentMonth();
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString();
  return { month, start, end };
}

function inPeriod(value: string | null | undefined, start: string, end: string) {
  return Boolean(value && value >= start && value < end);
}

function shopStatus(shop: { status: string; statusBeforeBlock: string | null; deletedAt: string | null; trialEndsAt: string | null }, hasPayment: boolean) {
  if (shop.deletedAt || shop.status === "deleted") return { key: "closed", label: "Encerrada" };
  if (shop.status === "blocked" || shop.statusBeforeBlock) return { key: "blocked", label: "Bloqueada" };
  const accessActive = Boolean(shop.trialEndsAt && Date.parse(shop.trialEndsAt) > Date.now());
  if (hasPayment && accessActive) return { key: "paying", label: "Pagante" };
  if (hasPayment) return { key: "expired", label: "Plano vencido" };
  if (accessActive) return { key: "trial", label: "Em teste" };
  return { key: "trial-ended", label: "Teste encerrado" };
}

function requireAffiliate(access: AffiliateAccess) {
  if (!access.active) throw new Error("Este acesso está pausado. Fale com o Cortou Anotou.");
}

export async function getAffiliateDashboard(access: AffiliateAccess, monthValue?: string) {
  requireAffiliate(access);
  const { month, start, end } = monthBounds(monthValue);
  const db = await getDb();
  const [profile, linkRows, referralRows, commissionRows, paymentRows, archiveRows] = await Promise.all([
    db.select({
      name: affiliates.name,
      email: affiliates.email,
      whatsapp: affiliates.whatsapp,
      payoutProvider: affiliates.payoutProvider,
      pixKey: affiliates.providerRecipientId,
      payoutStatus: affiliates.payoutStatus,
    }).from(affiliates).where(eq(affiliates.id, access.affiliateId)).limit(1),
    db.select().from(affiliateLinks).where(eq(affiliateLinks.affiliateId, access.affiliateId)).orderBy(asc(affiliateLinks.id)),
    db.select({
      id: organizationReferrals.id,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationStatus: organizations.status,
      statusBeforeBlock: organizations.statusBeforeBlock,
      trialEndsAt: organizations.trialEndsAt,
      deletedAt: organizations.deletedAt,
      attributedAt: organizationReferrals.attributedAt,
      commissionEndsAt: organizationReferrals.commissionEndsAt,
      affiliateLinkId: affiliateLinks.id,
      code: affiliateLinks.code,
      label: affiliateLinks.label,
    }).from(organizationReferrals)
      .innerJoin(affiliateLinks, eq(affiliateLinks.id, organizationReferrals.affiliateLinkId))
      .innerJoin(organizations, eq(organizations.id, organizationReferrals.organizationId))
      .where(eq(affiliateLinks.affiliateId, access.affiliateId))
      .orderBy(asc(organizationReferrals.attributedAt)),
    db.select().from(affiliateCommissions).where(eq(affiliateCommissions.affiliateId, access.affiliateId)).orderBy(asc(affiliateCommissions.id)),
    db.select({
      organizationId: subscriptionPayments.organizationId,
      paidAt: subscriptionPayments.paidAt,
      createdAt: subscriptionPayments.createdAt,
      amountCents: subscriptionPayments.amountCents,
    }).from(subscriptionPayments)
      .innerJoin(organizationReferrals, eq(organizationReferrals.organizationId, subscriptionPayments.organizationId))
      .innerJoin(affiliateLinks, eq(affiliateLinks.id, organizationReferrals.affiliateLinkId))
      .where(and(eq(affiliateLinks.affiliateId, access.affiliateId), eq(subscriptionPayments.status, "approved")))
      .orderBy(asc(subscriptionPayments.id)),
    db.select({ referralId: affiliateReferralArchives.referralId }).from(affiliateReferralArchives)
      .where(eq(affiliateReferralArchives.affiliateId, access.affiliateId)),
  ]);
  if (!profile[0]) throw new Error("Afiliado não encontrado.");

  const archivedReferralIds = new Set(archiveRows.map((item) => item.referralId));
  const paymentsByOrganization = new Map<number, typeof paymentRows>();
  for (const payment of paymentRows) {
    const group = paymentsByOrganization.get(payment.organizationId) ?? [];
    group.push(payment);
    paymentsByOrganization.set(payment.organizationId, group);
  }
  const commissionsByOrganization = new Map<number, typeof commissionRows>();
  const commissionsByLink = new Map<number, typeof commissionRows>();
  for (const commission of commissionRows) {
    const organizationGroup = commissionsByOrganization.get(commission.organizationId) ?? [];
    organizationGroup.push(commission);
    commissionsByOrganization.set(commission.organizationId, organizationGroup);
    const linkGroup = commissionsByLink.get(commission.affiliateLinkId) ?? [];
    linkGroup.push(commission);
    commissionsByLink.set(commission.affiliateLinkId, linkGroup);
  }

  const shops = referralRows.map((referral) => {
    const payments = paymentsByOrganization.get(referral.organizationId) ?? [];
    const commissions = commissionsByOrganization.get(referral.organizationId) ?? [];
    const lastPaymentAt = payments.map((payment) => payment.paidAt ?? payment.createdAt).sort().at(-1) ?? null;
    const status = shopStatus({
      status: referral.organizationStatus,
      statusBeforeBlock: referral.statusBeforeBlock,
      trialEndsAt: referral.trialEndsAt,
      deletedAt: referral.deletedAt,
    }, payments.length > 0);
    return {
      id: referral.id,
      name: referral.organizationName,
      attributedAt: referral.attributedAt,
      commissionEndsAt: referral.commissionEndsAt,
      linkLabel: referral.label || "Link principal",
      code: referral.code,
      status: status.key,
      statusLabel: status.label,
      archived: archivedReferralIds.has(referral.id),
      lastPaymentAt,
      monthCommissionCents: commissions.filter((item) => inPeriod(item.createdAt, start, end)).reduce((total, item) => total + item.commissionAmountCents, 0),
      lifetimeCommissionCents: commissions.reduce((total, item) => total + item.commissionAmountCents, 0),
    };
  }).sort((left, right) => right.attributedAt.localeCompare(left.attributedAt));

  const mainLinkId = linkRows[0]?.id ?? 0;
  const links = linkRows.map((link) => {
    const referrals = referralRows.filter((item) => item.affiliateLinkId === link.id);
    const commissions = commissionsByLink.get(link.id) ?? [];
    return {
      id: link.id,
      label: link.label || "Link principal",
      code: link.code,
      url: `${PUBLIC_APP_URL}/comece?ref=${encodeURIComponent(link.code)}`,
      commissionBps: link.commissionBps,
      commissionMonths: link.commissionMonths,
      active: link.active,
      isMain: link.id === mainLinkId,
      referrals: referrals.length,
      payingReferrals: referrals.filter((item) => (paymentsByOrganization.get(item.organizationId) ?? []).length > 0).length,
      earnedCents: commissions.reduce((total, item) => total + item.commissionAmountCents, 0),
      createdAt: link.createdAt,
    };
  });

  const payoutGroups = new Map<string, number>();
  for (const commission of commissionRows) {
    if (commission.status !== "paid" || !commission.paidAt) continue;
    payoutGroups.set(commission.paidAt, (payoutGroups.get(commission.paidAt) ?? 0) + commission.commissionAmountCents);
  }
  const payouts = Array.from(payoutGroups.entries()).map(([paidAt, amountCents]) => ({ paidAt, amountCents })).sort((left, right) => right.paidAt.localeCompare(left.paidAt));
  const monthCommissions = commissionRows.filter((item) => inPeriod(item.createdAt, start, end));
  const pendingStatuses = new Set(["pending", "pending_payout_setup"]);

  return {
    month,
    profile: {
      name: profile[0].name,
      email: access.email,
      whatsapp: profile[0].whatsapp,
      pixKey: profile[0].payoutProvider === "pix_manual" ? profile[0].pixKey ?? "" : "",
      payoutStatus: profile[0].payoutStatus,
    },
    summary: {
      monthReferrals: referralRows.filter((item) => inPeriod(item.attributedAt, start, end)).length,
      totalReferrals: referralRows.length,
      payingReferrals: new Set(paymentRows.map((item) => item.organizationId)).size,
      activeLinks: linkRows.filter((item) => item.active).length,
      monthCommissionCents: monthCommissions.reduce((total, item) => total + item.commissionAmountCents, 0),
      monthPaidCents: commissionRows.filter((item) => item.status === "paid" && inPeriod(item.paidAt, start, end)).reduce((total, item) => total + item.commissionAmountCents, 0),
      pendingCents: commissionRows.filter((item) => pendingStatuses.has(item.status)).reduce((total, item) => total + item.commissionAmountCents, 0),
      lifetimeCents: commissionRows.reduce((total, item) => total + item.commissionAmountCents, 0),
      paidLifetimeCents: commissionRows.filter((item) => item.status === "paid").reduce((total, item) => total + item.commissionAmountCents, 0),
    },
    links,
    shops,
    payouts,
  };
}

export async function createAffiliateLink(access: AffiliateAccess, input: { label?: string; code?: string }) {
  requireAffiliate(access);
  const db = await getDb();
  const affiliate = (await db.select({ name: affiliates.name }).from(affiliates).where(eq(affiliates.id, access.affiliateId)).limit(1))[0];
  const sourceLink = (await db.select().from(affiliateLinks).where(eq(affiliateLinks.affiliateId, access.affiliateId)).orderBy(asc(affiliateLinks.id)).limit(1))[0];
  if (!affiliate || !sourceLink) throw new Error("As regras de comissão deste afiliado ainda não foram configuradas.");
  const label = cleanText(input.label ?? "", 60) || `Campanha ${((await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(eq(affiliateLinks.affiliateId, access.affiliateId))).length + 1)}`;
  const baseCode = cleanCode(input.code || `${affiliate.name}-${label}`);
  if (baseCode.length < 3) throw new Error("Crie um código com pelo menos 3 caracteres.");
  let code = baseCode;
  if ((await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(eq(affiliateLinks.code, code)).limit(1))[0]) {
    code = `${baseCode.slice(0, 41)}-${crypto.randomUUID().slice(0, 6)}`;
  }
  const now = new Date().toISOString();
  await db.insert(affiliateLinks).values({
    affiliateId: access.affiliateId,
    code,
    label,
    commissionBps: sourceLink.commissionBps,
    commissionMonths: sourceLink.commissionMonths,
    createdByTeamMemberId: 0,
    createdByAffiliateAccountId: access.accountId,
    updatedAt: now,
  });
  return code;
}

export async function setOwnAffiliateLinkActive(access: AffiliateAccess, linkId: number, active: boolean) {
  requireAffiliate(access);
  if (!Number.isInteger(linkId) || linkId <= 0) throw new Error("Link inválido.");
  const db = await getDb();
  const link = (await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(and(
    eq(affiliateLinks.id, linkId),
    eq(affiliateLinks.affiliateId, access.affiliateId),
  )).limit(1))[0];
  if (!link) throw new Error("Link não encontrado.");
  await db.update(affiliateLinks).set({ active, updatedAt: new Date().toISOString() }).where(eq(affiliateLinks.id, link.id));
}

export async function deleteOwnUnusedAffiliateLink(access: AffiliateAccess, linkId: number) {
  requireAffiliate(access);
  if (!Number.isInteger(linkId) || linkId <= 0) throw new Error("Link inválido.");
  const db = await getDb();
  const links = await db.select({ id: affiliateLinks.id }).from(affiliateLinks)
    .where(eq(affiliateLinks.affiliateId, access.affiliateId)).orderBy(asc(affiliateLinks.id));
  if (!links.some((item) => item.id === linkId)) throw new Error("Link não encontrado.");
  if (links[0]?.id === linkId) throw new Error("O link principal não pode ser excluído.");

  const referralExists = db.select({ id: organizationReferrals.id }).from(organizationReferrals)
    .where(eq(organizationReferrals.affiliateLinkId, linkId));
  const commissionExists = db.select({ id: affiliateCommissions.id }).from(affiliateCommissions)
    .where(eq(affiliateCommissions.affiliateLinkId, linkId));
  const deleted = await db.delete(affiliateLinks).where(and(
    eq(affiliateLinks.id, linkId),
    eq(affiliateLinks.affiliateId, access.affiliateId),
    notExists(referralExists),
    notExists(commissionExists),
  )).returning({ id: affiliateLinks.id });
  if (!deleted.length) throw new Error("Este link já possui indicação ou comissão. Pause o link para preservar o histórico.");
}

export async function setOwnReferralArchived(access: AffiliateAccess, referralId: number, archived: boolean) {
  requireAffiliate(access);
  if (!Number.isInteger(referralId) || referralId <= 0) throw new Error("Indicação inválida.");
  const db = await getDb();
  const referral = (await db.select({ id: organizationReferrals.id }).from(organizationReferrals)
    .innerJoin(affiliateLinks, eq(affiliateLinks.id, organizationReferrals.affiliateLinkId))
    .where(and(eq(organizationReferrals.id, referralId), eq(affiliateLinks.affiliateId, access.affiliateId)))
    .limit(1))[0];
  if (!referral) throw new Error("Indicação não encontrada.");
  if (!archived) {
    await db.delete(affiliateReferralArchives).where(and(
      eq(affiliateReferralArchives.referralId, referralId),
      eq(affiliateReferralArchives.affiliateId, access.affiliateId),
    ));
    return;
  }
  const now = new Date().toISOString();
  await db.insert(affiliateReferralArchives).values({ referralId, affiliateId: access.affiliateId, archivedAt: now }).onConflictDoUpdate({
    target: affiliateReferralArchives.referralId,
    set: { affiliateId: access.affiliateId, archivedAt: now },
  });
}

export async function updateOwnAffiliatePix(access: AffiliateAccess, pixKeyValue: string) {
  requireAffiliate(access);
  const pixKey = cleanPixKey(pixKeyValue);
  if (pixKey && pixKey.length < 5) throw new Error("Confira a chave Pix informada.");
  const db = await getDb();
  await db.update(affiliates).set({
    payoutProvider: "pix_manual",
    providerRecipientId: pixKey || null,
    payoutStatus: pixKey ? "ready" : "pending_setup",
    updatedAt: new Date().toISOString(),
  }).where(eq(affiliates.id, access.affiliateId));
  if (pixKey) await db.update(affiliateCommissions).set({ status: "pending", updatedAt: new Date().toISOString() }).where(and(
    eq(affiliateCommissions.affiliateId, access.affiliateId),
    eq(affiliateCommissions.status, "pending_payout_setup"),
  ));
}
