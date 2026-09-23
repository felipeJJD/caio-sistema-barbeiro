import { and, desc, eq, isNull } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { notifyOwnersOfSubscriptionPayment } from "./notifications";
import { getPixPlan, getPlatformBillingOffer, type PixPlanCode } from "./platform-billing";
import { getPlatformSecret, mercadoPagoSecretNames } from "./platform-secrets";
import { affiliateCommissions, organizations, subscriptionPayments } from "./schema";
import { recordAffiliateCommission } from "./affiliates";
import { getAffiliateAccessToken, getOrganizationAffiliateSplit } from "./mercado-pago-affiliates";

const PIX_EXPIRATION_MINUTES = 30;
const PIX_FALLBACK_URL = "https://mpago.la/2yinhJS";
const DEFAULT_PUBLIC_APP_URL = "https://cortouanotou.com.br";

function resolvePublicAppUrl(value: unknown) {
  const candidate = String(value ?? "").trim().replace(/\/$/, "");
  if (!candidate) return DEFAULT_PUBLIC_APP_URL;

  try {
    const url = new URL(candidate);
    if (url.hostname === "railway.app" || url.hostname.endsWith(".up.railway.app")) {
      return DEFAULT_PUBLIC_APP_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

type MercadoPagoPayment = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_method_id?: string;
  date_approved?: string;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

type StoredPayment = typeof subscriptionPayments.$inferSelect;

export type PixPaymentView = {
  id: number;
  status: string;
  amountCents: number;
  periodDays: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
  accessUntil: string | null;
};

export class BillingConfigurationError extends Error {
  readonly fallbackUrl = PIX_FALLBACK_URL;
}

class MercadoPagoRequestError extends Error {
  constructor(readonly statusCode: number) {
    super("O Mercado Pago não conseguiu gerar a cobrança agora.");
  }
}

async function billingConfig() {
  const { env } = await import("@/runtime/env");
  const runtime = env as unknown as Record<string, unknown>;
  const publicAppUrl = resolvePublicAppUrl(runtime.PUBLIC_APP_URL);
  const environmentAccessToken = String(runtime.MERCADO_PAGO_ACCESS_TOKEN ?? "").trim();
  const environmentWebhookSecret = String(runtime.MERCADO_PAGO_WEBHOOK_SECRET ?? "").trim();
  return {
    accessToken: environmentAccessToken || await getPlatformSecret(mercadoPagoSecretNames.accessToken).catch(() => ""),
    webhookSecret: environmentWebhookSecret || await getPlatformSecret(mercadoPagoSecretNames.webhookSecret).catch(() => ""),
    publicAppUrl,
  };
}

function paymentView(payment: StoredPayment): PixPaymentView {
  return {
    id: payment.id,
    status: payment.status,
    amountCents: payment.amountCents,
    periodDays: payment.periodDays,
    qrCode: payment.qrCode,
    qrCodeBase64: payment.qrCodeBase64,
    ticketUrl: payment.ticketUrl,
    expiresAt: payment.expiresAt,
    accessUntil: payment.accessUntil,
  };
}

function providerStatus(status: string | undefined) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "charged_back") return "charged_back";
  if (status === "expired") return "expired";
  if (status === "in_process") return "in_process";
  return "pending";
}

async function mercadoPagoRequest(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as MercadoPagoPayment;
  if (!response.ok) throw new MercadoPagoRequestError(response.status);
  return payload;
}

async function fetchProviderPayment(providerPaymentId: string, accessToken: string) {
  if (!/^\d+$/.test(providerPaymentId)) throw new Error("Identificador de pagamento inválido.");
  return mercadoPagoRequest(`/v1/payments/${providerPaymentId}`, accessToken);
}

async function applyProviderPayment(order: StoredPayment, payment: MercadoPagoPayment) {
  const shouldNotifyApproval = !order.appliedAt;
  const providerPaymentId = String(payment.id ?? "");
  const amountCents = Math.round(Number(payment.transaction_amount ?? 0) * 100);
  if (!providerPaymentId || providerPaymentId !== order.providerPaymentId) throw new Error("Pagamento não reconhecido.");
  if (payment.external_reference !== order.externalReference) throw new Error("Referência de pagamento inválida.");
  if (amountCents !== order.amountCents || (payment.currency_id && payment.currency_id !== order.currency)) throw new Error("Valor de pagamento inválido.");
  if (payment.payment_method_id && payment.payment_method_id !== "pix") throw new Error("Forma de pagamento inválida.");

  const db = await getDb();
  const now = new Date().toISOString();
  const transaction = payment.point_of_interaction?.transaction_data;
  const normalizedStatus = providerStatus(payment.status);
  await db.update(subscriptionPayments).set({
    status: normalizedStatus,
    statusDetail: String(payment.status_detail ?? ""),
    qrCode: transaction?.qr_code ?? order.qrCode,
    qrCodeBase64: transaction?.qr_code_base64 ?? order.qrCodeBase64,
    ticketUrl: transaction?.ticket_url ?? order.ticketUrl,
    expiresAt: payment.date_of_expiration ?? order.expiresAt,
    paidAt: normalizedStatus === "approved" ? (payment.date_approved ?? order.paidAt ?? now) : order.paidAt,
    updatedAt: now,
  }).where(eq(subscriptionPayments.id, order.id));

  if (normalizedStatus !== "approved") {
    const fresh = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, order.id)).limit(1))[0];
    if (!fresh) throw new Error("Cobrança não encontrada após a atualização.");
    return fresh;
  }

  let accessUntil = order.accessUntil;
  if (!accessUntil) {
    const organization = (await db.select().from(organizations).where(eq(organizations.id, order.organizationId)).limit(1))[0];
    if (!organization) throw new Error("Barbearia não encontrada para este pagamento.");
    const existingEnd = organization.trialEndsAt ? Date.parse(organization.trialEndsAt) : Number.NaN;
    const baseTime = Number.isFinite(existingEnd) ? Math.max(Date.now(), existingEnd) : Date.now();
    const reservedUntil = new Date(baseTime + order.periodDays * 86400000).toISOString();
    await db.update(subscriptionPayments).set({ accessUntil: reservedUntil, updatedAt: now }).where(and(
      eq(subscriptionPayments.id, order.id),
      isNull(subscriptionPayments.accessUntil),
    ));
    const reserved = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, order.id)).limit(1))[0];
    accessUntil = reserved?.accessUntil ?? reservedUntil;
  }

  const currentOrganization = (await db.select().from(organizations).where(eq(organizations.id, order.organizationId)).limit(1))[0];
  if (!currentOrganization) throw new Error("Barbearia não encontrada para este pagamento.");
  const currentEnd = currentOrganization.trialEndsAt ? Date.parse(currentOrganization.trialEndsAt) : Number.NaN;
  const accessEnd = Date.parse(accessUntil);
  await db.update(organizations).set({
    status: "active",
    trialEndsAt: !Number.isFinite(currentEnd) || currentEnd < accessEnd ? accessUntil : currentOrganization.trialEndsAt,
  }).where(eq(organizations.id, order.organizationId));
  await db.update(subscriptionPayments).set({ appliedAt: now, updatedAt: now }).where(and(
    eq(subscriptionPayments.id, order.id),
    isNull(subscriptionPayments.appliedAt),
  ));

  const fresh = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, order.id)).limit(1))[0];
  if (!fresh) throw new Error("Cobrança não encontrada após a liberação.");
  if (shouldNotifyApproval) {
    const commission = await recordAffiliateCommission(fresh.id);
    if (commission && fresh.splitAffiliateId) {
      await db.update(affiliateCommissions).set({
        status: "paid",
        providerTransferId: fresh.providerPaymentId,
        paidAt: fresh.paidAt ?? now,
        updatedAt: now,
      }).where(eq(affiliateCommissions.id, commission.id));
    }
    await notifyOwnersOfSubscriptionPayment({
      organizationId: fresh.organizationId,
      paymentId: fresh.id,
      amountCents: fresh.amountCents,
      periodDays: fresh.periodDays,
    });
  }
  return fresh;
}

export async function createPixPayment(access: AccessContext, planCode: PixPlanCode = "monthly") {
  requireOwner(access);
  const config = await billingConfig();
  if (!config.accessToken) throw new BillingConfigurationError("A integração Pix ainda precisa ser conectada ao Mercado Pago.");

  const db = await getDb();
  const offer = await getPlatformBillingOffer();
  const plan = getPixPlan({ ...offer, pixPlans: access.accountType === "individual" ? offer.barberPixPlans : offer.pixPlans }, planCode);
  const now = new Date().toISOString();
  const reusable = (await db.select().from(subscriptionPayments).where(and(
    eq(subscriptionPayments.organizationId, access.organizationId),
    eq(subscriptionPayments.createdByTeamMemberId, access.teamMemberId),
    eq(subscriptionPayments.status, "pending"),
  )).orderBy(desc(subscriptionPayments.id)).limit(1))[0];
  if (reusable?.providerPaymentId && reusable.qrCode && reusable.expiresAt && reusable.amountCents === plan.priceCents && reusable.periodDays === plan.periodDays && Date.parse(reusable.expiresAt) > Date.now()) return paymentView(reusable);

  const idempotencyKey = crypto.randomUUID();
  const externalReference = `ca_${access.organizationId}_${idempotencyKey.replaceAll("-", "")}`;
  const localExpiration = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60000).toISOString();
  const inserted = (await db.insert(subscriptionPayments).values({
    organizationId: access.organizationId,
    createdByTeamMemberId: access.teamMemberId,
    externalReference,
    kind: `pix_${plan.code}`,
    amountCents: plan.priceCents,
    periodDays: plan.periodDays,
    expiresAt: localExpiration,
    updatedAt: now,
  }).returning())[0];

  try {
    const split = await getOrganizationAffiliateSplit(access.organizationId);
    if (split) await db.update(subscriptionPayments).set({ splitAffiliateId: split.affiliateId, updatedAt: now }).where(eq(subscriptionPayments.id, inserted.id));
    const nameParts = access.name.trim().split(/\s+/);
    const payment = await mercadoPagoRequest("/v1/payments", split?.accessToken ?? config.accessToken, {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        transaction_amount: plan.priceCents / 100,
        ...(split ? { application_fee: Math.max(0.01, Math.floor(plan.priceCents * (10000 - split.commissionBps) / 10000) / 100) } : {}),
        description: `Cortou Anotou - plano ${plan.label.toLowerCase()} (${plan.periodDays} dias)`,
        payment_method_id: "pix",
        external_reference: externalReference,
        notification_url: `${config.publicAppUrl}/api/payments/mercado-pago/webhook?source_news=webhooks`,
        date_of_expiration: localExpiration,
        payer: {
          email: access.email,
          first_name: nameParts[0] || "Cliente",
          last_name: nameParts.slice(1).join(" ") || "Cortou Anotou",
        },
        metadata: {
          subscription_payment_id: inserted.id,
          organization_id: access.organizationId,
          plan_code: plan.code,
          period_days: plan.periodDays,
        },
      }),
    });
    const providerPaymentId = String(payment.id ?? "");
    const transaction = payment.point_of_interaction?.transaction_data;
    if (!providerPaymentId || !transaction?.qr_code) throw new Error("O Mercado Pago não retornou o código Pix.");
    await db.update(subscriptionPayments).set({
      providerPaymentId,
      status: providerStatus(payment.status),
      statusDetail: String(payment.status_detail ?? ""),
      qrCode: transaction.qr_code,
      qrCodeBase64: transaction.qr_code_base64 ?? null,
      ticketUrl: transaction.ticket_url ?? null,
      expiresAt: payment.date_of_expiration ?? localExpiration,
      updatedAt: new Date().toISOString(),
    }).where(eq(subscriptionPayments.id, inserted.id));
    let fresh = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, inserted.id)).limit(1))[0];
    if (!fresh) throw new Error("Cobrança não encontrada após a criação.");
    if (providerStatus(payment.status) === "approved") fresh = await applyProviderPayment(fresh, payment);
    return paymentView(fresh);
  } catch (error) {
    const detail = error instanceof MercadoPagoRequestError ? `provider_http_${error.statusCode}` : "provider_response_invalid";
    await db.update(subscriptionPayments).set({ status: "error", statusDetail: detail, updatedAt: new Date().toISOString() }).where(eq(subscriptionPayments.id, inserted.id));
    throw new Error("Não foi possível gerar o Pix agora. Tente novamente em alguns instantes.");
  }
}

export async function syncMercadoPagoPayment(providerPaymentId: string) {
  const config = await billingConfig();
  if (!config.accessToken) throw new BillingConfigurationError("A integração Pix ainda não está configurada.");
  const db = await getDb();
  const order = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.providerPaymentId, providerPaymentId)).limit(1))[0];
  if (!order) return null;
  const splitAccessToken = order.splitAffiliateId ? await getAffiliateAccessToken(order.splitAffiliateId) : null;
  if (order.splitAffiliateId && !splitAccessToken) throw new Error("A conta Mercado Pago do afiliado precisa ser reconectada.");
  const payment = await fetchProviderPayment(providerPaymentId, splitAccessToken ?? config.accessToken);
  return applyProviderPayment(order, payment);
}

export async function getPixPayment(access: AccessContext, orderId: number) {
  requireOwner(access);
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error("Cobrança inválida.");
  const db = await getDb();
  let order = (await db.select().from(subscriptionPayments).where(and(
    eq(subscriptionPayments.id, orderId),
    eq(subscriptionPayments.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!order) throw new Error("Cobrança não encontrada.");

  if ((order.status === "pending" || order.status === "in_process") && order.providerPaymentId) {
    try {
      order = await syncMercadoPagoPayment(order.providerPaymentId) ?? order;
    } catch {
      // O polling continua mostrando a cobrança local se o provedor estiver momentaneamente indisponível.
    }
  }
  return paymentView(order);
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateMercadoPagoWebhookSignature(request: Request, dataId: string) {
  const { webhookSecret } = await billingConfig();
  if (!webhookSecret) return false;
  const db = await getDb();
  const splitOrder = (await db.select({ splitAffiliateId: subscriptionPayments.splitAffiliateId }).from(subscriptionPayments).where(eq(subscriptionPayments.providerPaymentId, dataId)).limit(1))[0];
  // Para o split, a notificação só dispara uma consulta autenticada ao Mercado Pago;
  // nenhuma informação recebida no webhook é aplicada diretamente.
  if (splitOrder?.splitAffiliateId) return true;
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }));
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  return secureEqual(bytesToHex(signed), parts.v1.toLowerCase());
}

export function pixFallbackUrl() {
  return PIX_FALLBACK_URL;
}
