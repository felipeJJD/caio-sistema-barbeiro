import { eq, inArray } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { platformSecrets } from "./schema";

const MERCADO_PAGO_ACCESS_TOKEN_KEY = "mercado_pago_access_token";
const MERCADO_PAGO_WEBHOOK_SECRET_KEY = "mercado_pago_webhook_secret";
const MERCADO_PAGO_MARKETPLACE_CLIENT_ID_KEY = "mercado_pago_marketplace_client_id";
const MERCADO_PAGO_MARKETPLACE_CLIENT_SECRET_KEY = "mercado_pago_marketplace_client_secret";

type SecretName = typeof MERCADO_PAGO_ACCESS_TOKEN_KEY | typeof MERCADO_PAGO_WEBHOOK_SECRET_KEY | typeof MERCADO_PAGO_MARKETPLACE_CLIENT_ID_KEY | typeof MERCADO_PAGO_MARKETPLACE_CLIENT_SECRET_KEY;

type MercadoPagoAccount = {
  id?: number | string;
  nickname?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const { env } = await import("@/runtime/env");
  const material = String((env as unknown as Record<string, unknown>).PLATFORM_SECRETS_ENCRYPTION_KEY ?? "").trim();
  if (material.length < 32) throw new Error("A proteção interna das credenciais ainda não foi ativada.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return {
    encryptedValue: bytesToBase64(new Uint8Array(encrypted)),
    initializationVector: bytesToBase64(initializationVector),
  };
}

export async function decryptSecret(encryptedValue: string, initializationVector: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(initializationVector) },
    await encryptionKey(),
    base64ToBytes(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
}

async function storeSecret(access: AccessContext, key: SecretName, value: string) {
  const protectedValue = await encryptSecret(value);
  const updatedAt = new Date().toISOString();
  const db = await getDb();
  await db.insert(platformSecrets).values({
    key,
    ...protectedValue,
    updatedByTeamMemberId: access.teamMemberId,
    updatedAt,
  }).onConflictDoUpdate({
    target: platformSecrets.key,
    set: {
      ...protectedValue,
      updatedByTeamMemberId: access.teamMemberId,
      updatedAt,
    },
  });
}

export async function getPlatformSecret(key: SecretName) {
  const db = await getDb();
  const stored = (await db.select().from(platformSecrets).where(eq(platformSecrets.key, key)).limit(1))[0];
  if (!stored) return "";
  return decryptSecret(stored.encryptedValue, stored.initializationVector);
}

async function validateMercadoPagoAccessToken(accessToken: string) {
  const response = await fetch("https://api.mercadopago.com/users/me", {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  const account = await response.json().catch(() => ({})) as MercadoPagoAccount;
  if (!response.ok || !account.id) {
    throw new Error("O Mercado Pago não reconheceu esse Access Token. Copie novamente nas credenciais de produção.");
  }
  const fullName = [account.first_name, account.last_name].filter(Boolean).join(" ").trim();
  return {
    accountId: String(account.id),
    accountLabel: fullName || account.nickname || account.email || `Conta ${account.id}`,
  };
}

export async function saveMercadoPagoCredentials(access: AccessContext, input: { accessToken: string; webhookSecret?: string }) {
  requirePlatformAdmin(access);
  const accessToken = input.accessToken.trim();
  const webhookSecret = input.webhookSecret?.trim() ?? "";
  if (accessToken.length < 40 || accessToken.length > 500 || !accessToken.startsWith("APP_USR-")) {
    throw new Error("Cole o Access Token de produção completo, começando por APP_USR-.");
  }
  const account = await validateMercadoPagoAccessToken(accessToken);
  await storeSecret(access, MERCADO_PAGO_ACCESS_TOKEN_KEY, accessToken);
  if (webhookSecret) await storeSecret(access, MERCADO_PAGO_WEBHOOK_SECRET_KEY, webhookSecret);
  return account;
}

export async function getMercadoPagoIntegrationStatus(access: AccessContext) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const rows = await db.select({ key: platformSecrets.key, updatedAt: platformSecrets.updatedAt }).from(platformSecrets).where(inArray(platformSecrets.key, [
    MERCADO_PAGO_ACCESS_TOKEN_KEY,
    MERCADO_PAGO_WEBHOOK_SECRET_KEY,
  ]));
  const accessToken = rows.find((row) => row.key === MERCADO_PAGO_ACCESS_TOKEN_KEY);
  const webhookSecret = rows.find((row) => row.key === MERCADO_PAGO_WEBHOOK_SECRET_KEY);
  return {
    configured: Boolean(accessToken),
    webhookConfigured: Boolean(webhookSecret),
    updatedAt: accessToken?.updatedAt ?? null,
  };
}

export async function saveMercadoPagoMarketplaceCredentials(access: AccessContext, input: { clientId: string; clientSecret: string }) {
  requirePlatformAdmin(access);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!/^\d{6,30}$/.test(clientId)) throw new Error("Confira o Client ID da aplicação de afiliados.");
  if (clientSecret.length < 20 || clientSecret.length > 500) throw new Error("Confira o Client Secret da aplicação de afiliados.");
  await storeSecret(access, MERCADO_PAGO_MARKETPLACE_CLIENT_ID_KEY, clientId);
  await storeSecret(access, MERCADO_PAGO_MARKETPLACE_CLIENT_SECRET_KEY, clientSecret);
}

export async function getMercadoPagoMarketplaceStatus(access: AccessContext) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const rows = await db.select({ key: platformSecrets.key, updatedAt: platformSecrets.updatedAt }).from(platformSecrets).where(inArray(platformSecrets.key, [
    MERCADO_PAGO_MARKETPLACE_CLIENT_ID_KEY,
    MERCADO_PAGO_MARKETPLACE_CLIENT_SECRET_KEY,
  ]));
  const clientId = rows.find((row) => row.key === MERCADO_PAGO_MARKETPLACE_CLIENT_ID_KEY);
  const clientSecret = rows.find((row) => row.key === MERCADO_PAGO_MARKETPLACE_CLIENT_SECRET_KEY);
  return { configured: Boolean(clientId && clientSecret), updatedAt: clientId?.updatedAt ?? null };
}

export const mercadoPagoSecretNames = {
  accessToken: MERCADO_PAGO_ACCESS_TOKEN_KEY,
  webhookSecret: MERCADO_PAGO_WEBHOOK_SECRET_KEY,
  marketplaceClientId: MERCADO_PAGO_MARKETPLACE_CLIENT_ID_KEY,
  marketplaceClientSecret: MERCADO_PAGO_MARKETPLACE_CLIENT_SECRET_KEY,
} as const;
