import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { affiliateAccounts, affiliateCommissions, affiliateInvites, affiliateLinks, affiliateMercadoPagoConnections, affiliateMercadoPagoStates, affiliateSessions, affiliates, organizationReferrals, subscriptionPayments } from "./schema";

const PUBLIC_APP_URL = "https://cortouanotou.com.br";

function cleanText(value: string, maximum: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function cleanCode(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function cleanPixKey(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
}

function monthEndFrom(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

export async function resolveAffiliateLink(codeValue?: string) {
  const code = cleanCode(codeValue ?? "");
  if (!code) return null;
  const db = await getDb();
  const row = (await db.select({
    id: affiliateLinks.id,
    affiliateId: affiliateLinks.affiliateId,
    code: affiliateLinks.code,
    commissionBps: affiliateLinks.commissionBps,
    commissionMonths: affiliateLinks.commissionMonths,
  }).from(affiliateLinks).innerJoin(affiliates, eq(affiliates.id, affiliateLinks.affiliateId)).where(and(
    eq(affiliateLinks.code, code),
    eq(affiliateLinks.active, true),
    eq(affiliates.active, true),
  )).limit(1))[0];
  return row ?? null;
}

export async function attachOrganizationReferral(organizationId: number, codeValue?: string) {
  const link = await resolveAffiliateLink(codeValue);
  if (!link) return null;
  const db = await getDb();
  const attributedAt = new Date().toISOString();
  await db.insert(organizationReferrals).values({
    organizationId,
    affiliateLinkId: link.id,
    attributedAt,
    commissionEndsAt: monthEndFrom(new Date(attributedAt), link.commissionMonths),
  }).onConflictDoNothing();
  return link;
}

export async function recordAffiliateCommission(subscriptionPaymentId: number) {
  const db = await getDb();
  const payment = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, subscriptionPaymentId)).limit(1))[0];
  if (!payment || payment.status !== "approved") return null;
  const now = new Date().toISOString();
  const referral = (await db.select({
    organizationId: organizationReferrals.organizationId,
    commissionEndsAt: organizationReferrals.commissionEndsAt,
    affiliateLinkId: affiliateLinks.id,
    affiliateId: affiliateLinks.affiliateId,
    commissionBps: affiliateLinks.commissionBps,
  }).from(organizationReferrals).innerJoin(affiliateLinks, eq(affiliateLinks.id, organizationReferrals.affiliateLinkId)).where(and(
    eq(organizationReferrals.organizationId, payment.organizationId),
    eq(affiliateLinks.active, true),
  )).limit(1))[0];
  if (!referral || referral.commissionEndsAt <= now) return null;
  const commissionAmountCents = Math.floor(payment.amountCents * referral.commissionBps / 10000);
  if (commissionAmountCents <= 0) return null;
  await db.insert(affiliateCommissions).values({
    affiliateId: referral.affiliateId,
    affiliateLinkId: referral.affiliateLinkId,
    organizationId: payment.organizationId,
    subscriptionPaymentId: payment.id,
    rateBps: referral.commissionBps,
    grossAmountCents: payment.amountCents,
    commissionAmountCents,
    status: "pending",
    availableAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  return (await db.select().from(affiliateCommissions).where(eq(affiliateCommissions.subscriptionPaymentId, payment.id)).limit(1))[0] ?? null;
}

export async function listAffiliates(access: AccessContext) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const rows = await db.select({
    id: affiliates.id,
    name: affiliates.name,
    email: affiliates.email,
    whatsapp: affiliates.whatsapp,
    payoutProvider: affiliates.payoutProvider,
    payoutStatus: affiliates.payoutStatus,
    providerRecipientId: affiliates.providerRecipientId,
    active: affiliates.active,
    createdAt: affiliates.createdAt,
  }).from(affiliates).orderBy(desc(affiliates.id));

  // Deploys antigos podem abrir a tela enquanto a migração do portal ainda está
  // terminando. A listagem principal não deve cair nem expor a consulta SQL.
  let accessRows: Array<{ affiliateId: number; lastLoginAt: string | null }> = [];
  try {
    accessRows = await db.select({
      affiliateId: affiliateAccounts.affiliateId,
      lastLoginAt: affiliateAccounts.lastLoginAt,
    }).from(affiliateAccounts);
  } catch {
    accessRows = [];
  }

  let linkRows: Array<{ id: number; affiliateId: number; label: string; code: string; commissionBps: number; commissionMonths: number; active: boolean }> = [];
  try {
    linkRows = await db.select({
      id: affiliateLinks.id,
      affiliateId: affiliateLinks.affiliateId,
      label: affiliateLinks.label,
      code: affiliateLinks.code,
      commissionBps: affiliateLinks.commissionBps,
      commissionMonths: affiliateLinks.commissionMonths,
      active: affiliateLinks.active,
    }).from(affiliateLinks).orderBy(desc(affiliateLinks.id));
  } catch {
    const legacyLinks = await db.select({
      id: affiliateLinks.id,
      affiliateId: affiliateLinks.affiliateId,
      code: affiliateLinks.code,
      commissionBps: affiliateLinks.commissionBps,
      commissionMonths: affiliateLinks.commissionMonths,
      active: affiliateLinks.active,
    }).from(affiliateLinks).orderBy(desc(affiliateLinks.id));
    linkRows = legacyLinks.map((link) => ({ ...link, label: "Link principal" }));
  }

  let referralRows: Array<{ affiliateLinkId: number }> = [];
  try {
    referralRows = await db.select({ affiliateLinkId: organizationReferrals.affiliateLinkId }).from(organizationReferrals);
  } catch {
    referralRows = [];
  }

  let commissionRows: Array<{ affiliateId: number; commissionAmountCents: number; status: string; paidAt: string | null }> = [];
  try {
    commissionRows = await db.select({
      affiliateId: affiliateCommissions.affiliateId,
      commissionAmountCents: affiliateCommissions.commissionAmountCents,
      status: affiliateCommissions.status,
      paidAt: affiliateCommissions.paidAt,
    }).from(affiliateCommissions);
  } catch {
    commissionRows = [];
  }

  const accessByAffiliate = new Map(accessRows.map((account) => [account.affiliateId, account]));
  const referralsByLink = new Map<number, number>();
  for (const referral of referralRows) {
    referralsByLink.set(referral.affiliateLinkId, (referralsByLink.get(referral.affiliateLinkId) ?? 0) + 1);
  }
  const commissionsByAffiliate = new Map<number, { earnedCents: number; pendingCents: number; paidCents: number; lastPaidAt: string | null }>();
  for (const commission of commissionRows) {
    const totals = commissionsByAffiliate.get(commission.affiliateId) ?? { earnedCents: 0, pendingCents: 0, paidCents: 0, lastPaidAt: null };
    const amount = Number(commission.commissionAmountCents) || 0;
    totals.earnedCents += amount;
    if (commission.status === "paid") {
      totals.paidCents += amount;
      if (commission.paidAt && (!totals.lastPaidAt || commission.paidAt > totals.lastPaidAt)) totals.lastPaidAt = commission.paidAt;
    } else if (commission.status === "pending" || commission.status === "pending_payout_setup") {
      totals.pendingCents += amount;
    }
    commissionsByAffiliate.set(commission.affiliateId, totals);
  }

  return rows.map((row) => {
    const affiliateLinkRows = linkRows.filter((link) => link.affiliateId === row.id).sort((first, second) => first.id - second.id);
    const primaryLink = affiliateLinkRows[0];
    const accessAccount = accessByAffiliate.get(row.id);
    const commissionTotals = commissionsByAffiliate.get(row.id) ?? { earnedCents: 0, pendingCents: 0, paidCents: 0, lastPaidAt: null };
    const links = affiliateLinkRows.map((link) => ({
      ...link,
      label: link.label || "Link principal",
      referrals: referralsByLink.get(link.id) ?? 0,
      url: `${PUBLIC_APP_URL}/comece?ref=${encodeURIComponent(link.code)}`,
    }));
    return {
      ...row,
      code: primaryLink?.code ?? "",
      commissionBps: Number(primaryLink?.commissionBps ?? 0),
      commissionMonths: Number(primaryLink?.commissionMonths ?? 0),
      linkActive: Boolean(primaryLink?.active),
      linksCount: links.length,
      referrals: links.reduce((total, link) => total + Number(link.referrals), 0),
      ...commissionTotals,
      hasAccess: Boolean(accessAccount),
      lastLoginAt: accessAccount?.lastLoginAt ?? null,
      links,
      pixKey: row.payoutProvider === "pix_manual" ? row.providerRecipientId ?? "" : "",
      url: `${PUBLIC_APP_URL}/comece?ref=${encodeURIComponent(primaryLink?.code ?? "")}`,
    };
  });
}

export async function createAffiliate(access: AccessContext, input: {
  name: string;
  email?: string;
  whatsapp?: string;
  pixKey?: string;
  code?: string;
  commissionBps: number;
  commissionMonths: number;
}) {
  requirePlatformAdmin(access);
  const name = cleanText(input.name, 100);
  const email = cleanText(input.email ?? "", 160).toLowerCase();
  const whatsapp = (input.whatsapp ?? "").replace(/\D/g, "").slice(0, 15);
  const pixKey = cleanPixKey(input.pixKey ?? "");
  const commissionBps = Math.round(input.commissionBps);
  const commissionMonths = Math.round(input.commissionMonths);
  if (name.length < 2) throw new Error("Informe o nome do afiliado.");
  if (commissionBps < 100 || commissionBps > 5000) throw new Error("A comissão deve ficar entre 1% e 50%.");
  if (commissionMonths < 1 || commissionMonths > 36) throw new Error("A duração deve ficar entre 1 e 36 meses.");
  const baseCode = cleanCode(input.code || name);
  if (baseCode.length < 3) throw new Error("Crie um código com pelo menos 3 caracteres.");
  const db = await getDb();
  // Protege contra toque duplo e novas tentativas depois de uma resposta lenta.
  // Se os mesmos dados já foram salvos, reutilizamos o cadastro e geramos apenas
  // um novo convite, em vez de criar outro afiliado igual.
  const existingAffiliate = email || whatsapp ? (await db.select({ id: affiliates.id }).from(affiliates).where(and(
    eq(affiliates.name, name),
    eq(affiliates.email, email),
    eq(affiliates.whatsapp, whatsapp),
  )).orderBy(desc(affiliates.id)).limit(1))[0] : null;
  if (existingAffiliate) {
    const now = new Date().toISOString();
    await db.update(affiliates).set({
      active: true,
      payoutProvider: "pix_manual",
      providerRecipientId: pixKey || null,
      payoutStatus: pixKey ? "ready" : "pending_setup",
      updatedAt: now,
    }).where(eq(affiliates.id, existingAffiliate.id));
    const primaryLink = (await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(eq(affiliateLinks.affiliateId, existingAffiliate.id)).orderBy(affiliateLinks.id).limit(1))[0];
    if (primaryLink) {
      await db.update(affiliateLinks).set({ commissionBps, commissionMonths, active: true, updatedAt: now }).where(eq(affiliateLinks.id, primaryLink.id));
      return existingAffiliate.id;
    }
  }
  let code = baseCode;
  if ((await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(eq(affiliateLinks.code, code)).limit(1))[0]) {
    code = `${baseCode.slice(0, 41)}-${crypto.randomUUID().slice(0, 6)}`;
  }
  const now = new Date().toISOString();
  const affiliate = (await db.insert(affiliates).values({
    name,
    email,
    whatsapp,
    payoutProvider: "pix_manual",
    providerRecipientId: pixKey || null,
    payoutStatus: pixKey ? "ready" : "pending_setup",
    updatedAt: now,
  }).returning({ id: affiliates.id }))[0];
  await db.insert(affiliateLinks).values({
    affiliateId: affiliate.id,
    code,
    label: "Link principal",
    commissionBps,
    commissionMonths,
    createdByTeamMemberId: access.teamMemberId,
    updatedAt: now,
  });
  return affiliate.id;
}

export async function setAffiliateActive(access: AccessContext, affiliateId: number, active: boolean) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) throw new Error("Afiliado inválido.");
  const db = await getDb();
  const now = new Date().toISOString();
  await db.update(affiliates).set({ active, updatedAt: now }).where(eq(affiliates.id, affiliateId));
  await db.update(affiliateLinks).set({ active, updatedAt: now }).where(eq(affiliateLinks.affiliateId, affiliateId));
  if (!active) {
    const accounts = await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, affiliateId));
    for (const account of accounts) await db.delete(affiliateSessions).where(eq(affiliateSessions.accountId, account.id));
  }
  return listAffiliates(access);
}

export async function deleteAffiliate(access: AccessContext, affiliateId: number) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) throw new Error("Afiliado inválido.");
  const db = await getDb();
  const affiliate = (await db.select({ id: affiliates.id, name: affiliates.name }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1))[0];
  if (!affiliate) throw new Error("Afiliado não encontrado.");

  const accountRows = await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, affiliateId));
  for (const account of accountRows) await db.delete(affiliateSessions).where(eq(affiliateSessions.accountId, account.id));

  const linkRows = await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(eq(affiliateLinks.affiliateId, affiliateId));
  for (const link of linkRows) await db.delete(organizationReferrals).where(eq(organizationReferrals.affiliateLinkId, link.id));

  const now = new Date().toISOString();
  await db.update(subscriptionPayments).set({ splitAffiliateId: null, updatedAt: now }).where(eq(subscriptionPayments.splitAffiliateId, affiliateId));
  await db.delete(affiliateCommissions).where(eq(affiliateCommissions.affiliateId, affiliateId));
  await db.delete(affiliateMercadoPagoStates).where(eq(affiliateMercadoPagoStates.affiliateId, affiliateId));
  await db.delete(affiliateMercadoPagoConnections).where(eq(affiliateMercadoPagoConnections.affiliateId, affiliateId));
  await db.delete(affiliateInvites).where(eq(affiliateInvites.affiliateId, affiliateId));
  await db.delete(affiliateLinks).where(eq(affiliateLinks.affiliateId, affiliateId));
  await db.delete(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, affiliateId));
  await db.delete(affiliates).where(eq(affiliates.id, affiliateId));
  return listAffiliates(access);
}

export async function updateAffiliatePix(access: AccessContext, affiliateId: number, pixKeyValue: string) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) throw new Error("Afiliado inválido.");
  const pixKey = cleanPixKey(pixKeyValue);
  if (pixKey && pixKey.length < 5) throw new Error("Confira a chave Pix informada.");
  const db = await getDb();
  const affiliate = (await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1))[0];
  if (!affiliate) throw new Error("Afiliado não encontrado.");
  const now = new Date().toISOString();
  await db.update(affiliates).set({
    payoutProvider: "pix_manual",
    providerRecipientId: pixKey || null,
    payoutStatus: pixKey ? "ready" : "pending_setup",
    updatedAt: now,
  }).where(eq(affiliates.id, affiliateId));
  await db.update(affiliateCommissions).set({ status: "pending", updatedAt: now }).where(and(
    eq(affiliateCommissions.affiliateId, affiliateId),
    eq(affiliateCommissions.status, "pending_payout_setup"),
  ));
  return listAffiliates(access);
}

export async function markAffiliatePayoutPaid(access: AccessContext, affiliateId: number) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) throw new Error("Afiliado inválido.");
  const db = await getDb();
  const affiliate = (await db.select({ id: affiliates.id, pixKey: affiliates.providerRecipientId, payoutProvider: affiliates.payoutProvider }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1))[0];
  if (!affiliate) throw new Error("Afiliado não encontrado.");
  if (affiliate.payoutProvider !== "pix_manual" || !affiliate.pixKey) throw new Error("Cadastre a chave Pix antes de confirmar o repasse.");
  const pending = (await db.select({
    amountCents: sql<number>`coalesce(sum(${affiliateCommissions.commissionAmountCents}), 0)`,
  }).from(affiliateCommissions).where(and(eq(affiliateCommissions.affiliateId, affiliateId), ne(affiliateCommissions.status, "paid"))))[0];
  if (!pending || Number(pending.amountCents) <= 0) throw new Error("Este afiliado não possui repasse pendente.");
  const now = new Date().toISOString();
  await db.update(affiliateCommissions).set({
    status: "paid",
    providerTransferId: `pix_manual_${crypto.randomUUID()}`,
    paidAt: now,
    updatedAt: now,
  }).where(and(eq(affiliateCommissions.affiliateId, affiliateId), ne(affiliateCommissions.status, "paid")));
  return listAffiliates(access);
}

export async function affiliateCommissionSummary(access: AccessContext) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const row = (await db.select({
    totalCents: sql<number>`coalesce(sum(${affiliateCommissions.commissionAmountCents}), 0)`,
    pendingCents: sql<number>`coalesce(sum(case when ${affiliateCommissions.status} != 'paid' then ${affiliateCommissions.commissionAmountCents} else 0 end), 0)`,
    paidCents: sql<number>`coalesce(sum(case when ${affiliateCommissions.status} = 'paid' then ${affiliateCommissions.commissionAmountCents} else 0 end), 0)`,
  }).from(affiliateCommissions))[0];
  return row ?? { totalCents: 0, pendingCents: 0, paidCents: 0 };
}
