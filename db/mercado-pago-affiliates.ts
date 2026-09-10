import { and, eq, isNull } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { decryptSecret, encryptSecret, getPlatformSecret, mercadoPagoSecretNames } from "./platform-secrets";
import { affiliateLinks, affiliateMercadoPagoConnections, affiliateMercadoPagoStates, affiliates, organizationReferrals } from "./schema";

const PUBLIC_APP_URL = "https://cortouanotou.com.br";
export const MARKETPLACE_REDIRECT_URI = `${PUBLIC_APP_URL}/api/affiliates/mercado-pago/callback`;

type OAuthTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  user_id?: number | string;
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function tokenHash(token: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

async function pkceChallenge(verifier: string) {
  return bytesToBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

async function marketplaceCredentials() {
  const [clientId, clientSecret] = await Promise.all([
    getPlatformSecret(mercadoPagoSecretNames.marketplaceClientId),
    getPlatformSecret(mercadoPagoSecretNames.marketplaceClientSecret),
  ]);
  if (!clientId || !clientSecret) throw new Error("Configure o Client ID e o Client Secret da aplicação de afiliados.");
  return { clientId, clientSecret };
}

async function requestToken(values: Record<string, string>) {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
  const payload = await response.json().catch(() => ({})) as OAuthTokenPayload;
  if (!response.ok || !payload.access_token || !payload.refresh_token || !payload.user_id) {
    throw new Error("O Mercado Pago não concluiu a autorização. Tente gerar um novo link.");
  }
  return payload;
}

async function storeConnection(affiliateId: number, payload: OAuthTokenPayload) {
  const accessToken = await encryptSecret(String(payload.access_token));
  const refreshToken = await encryptSecret(String(payload.refresh_token));
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(300, Number(payload.expires_in ?? 15552000)) * 1000).toISOString();
  const db = await getDb();
  await db.insert(affiliateMercadoPagoConnections).values({
    affiliateId,
    providerUserId: String(payload.user_id),
    encryptedAccessToken: accessToken.encryptedValue,
    accessTokenIv: accessToken.initializationVector,
    encryptedRefreshToken: refreshToken.encryptedValue,
    refreshTokenIv: refreshToken.initializationVector,
    scope: String(payload.scope ?? ""),
    expiresAt,
    connectedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: affiliateMercadoPagoConnections.affiliateId,
    set: {
      providerUserId: String(payload.user_id),
      encryptedAccessToken: accessToken.encryptedValue,
      accessTokenIv: accessToken.initializationVector,
      encryptedRefreshToken: refreshToken.encryptedValue,
      refreshTokenIv: refreshToken.initializationVector,
      scope: String(payload.scope ?? ""),
      expiresAt,
      updatedAt: now,
    },
  });
  await db.update(affiliates).set({
    payoutProvider: "mercado_pago",
    providerRecipientId: String(payload.user_id),
    payoutStatus: "connected",
    updatedAt: now,
  }).where(eq(affiliates.id, affiliateId));
}

export async function createAffiliateConnectionLink(access: AccessContext, affiliateId: number) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) throw new Error("Afiliado inválido.");
  await marketplaceCredentials();
  const db = await getDb();
  const affiliate = (await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1))[0];
  if (!affiliate) throw new Error("Afiliado não encontrado.");
  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();
  await db.insert(affiliateMercadoPagoStates).values({
    tokenHash: await tokenHash(token),
    affiliateId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
  });
  return `${PUBLIC_APP_URL}/api/affiliates/mercado-pago/connect?token=${encodeURIComponent(token)}`;
}

export async function mercadoPagoAuthorizationUrl(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Este link de conexão é inválido.");
  const db = await getDb();
  const state = (await db.select().from(affiliateMercadoPagoStates).where(and(
    eq(affiliateMercadoPagoStates.tokenHash, await tokenHash(token)),
    isNull(affiliateMercadoPagoStates.usedAt),
  )).limit(1))[0];
  if (!state || state.expiresAt <= new Date().toISOString()) throw new Error("Este link expirou. Peça um novo link ao Cortou Anotou.");
  const { clientId } = await marketplaceCredentials();
  const url = new URL("https://auth.mercadopago.com.br/authorization");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", token);
  url.searchParams.set("redirect_uri", MARKETPLACE_REDIRECT_URI);
  url.searchParams.set("code_challenge", await pkceChallenge(token));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function completeMercadoPagoAuthorization(code: string, stateToken: string) {
  if (!code || !/^[a-f0-9]{64}$/i.test(stateToken)) throw new Error("Autorização incompleta.");
  const db = await getDb();
  const stateHash = await tokenHash(stateToken);
  const state = (await db.select().from(affiliateMercadoPagoStates).where(and(
    eq(affiliateMercadoPagoStates.tokenHash, stateHash),
    isNull(affiliateMercadoPagoStates.usedAt),
  )).limit(1))[0];
  if (!state || state.expiresAt <= new Date().toISOString()) throw new Error("Esta autorização expirou.");
  const { clientId, clientSecret } = await marketplaceCredentials();
  const payload = await requestToken({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: MARKETPLACE_REDIRECT_URI,
    state: stateToken,
    code_verifier: stateToken,
  });
  await storeConnection(state.affiliateId, payload);
  await db.update(affiliateMercadoPagoStates).set({ usedAt: new Date().toISOString() }).where(eq(affiliateMercadoPagoStates.tokenHash, stateHash));
}

async function activeAccessToken(affiliateId: number) {
  const db = await getDb();
  const connection = (await db.select().from(affiliateMercadoPagoConnections).where(eq(affiliateMercadoPagoConnections.affiliateId, affiliateId)).limit(1))[0];
  if (!connection) return null;
  if (Date.parse(connection.expiresAt) > Date.now() + 24 * 60 * 60 * 1000) {
    return decryptSecret(connection.encryptedAccessToken, connection.accessTokenIv);
  }
  const { clientId, clientSecret } = await marketplaceCredentials();
  const refreshToken = await decryptSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
  const payload = await requestToken({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
  await storeConnection(affiliateId, payload);
  return String(payload.access_token);
}

export async function getOrganizationAffiliateSplit(organizationId: number) {
  const now = new Date().toISOString();
  const db = await getDb();
  const referral = (await db.select({
    affiliateId: affiliates.id,
    commissionBps: affiliateLinks.commissionBps,
    commissionEndsAt: organizationReferrals.commissionEndsAt,
  }).from(organizationReferrals)
    .innerJoin(affiliateLinks, eq(affiliateLinks.id, organizationReferrals.affiliateLinkId))
    .innerJoin(affiliates, eq(affiliates.id, affiliateLinks.affiliateId))
    .where(and(eq(organizationReferrals.organizationId, organizationId), eq(affiliateLinks.active, true), eq(affiliates.active, true), eq(affiliates.payoutStatus, "connected")))
    .limit(1))[0];
  if (!referral || referral.commissionEndsAt <= now) return null;
  const accessToken = await activeAccessToken(referral.affiliateId);
  return accessToken ? { ...referral, accessToken } : null;
}

export async function getAffiliateAccessToken(affiliateId: number) {
  return activeAccessToken(affiliateId);
}
