import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner, requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { decryptSecret, encryptSecret } from "./platform-secrets";
import { normalizeWhatsappPhone, whatsappReminderAt } from "../lib/whatsapp";
import {
  appointments,
  organizations,
  services,
  team,
  whatsappAutomationSettings,
  whatsappConnections,
  whatsappConversations,
  whatsappMessages,
} from "./schema";

export type WhatsappAutomationKind = "confirmation" | "reminder" | "cancellation" | "rescheduled";

export type WhatsappAutomationStatus = {
  connection: {
    status: string;
    provider: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string;
    onboardingMode: string;
    tokenExpiresAt: string | null;
    webhookSubscribedAt: string | null;
    registeredAt: string | null;
    connectedAt: string | null;
    updatedAt: string | null;
  };
  settings: {
    enabled: boolean;
    confirmationEnabled: boolean;
    reminderEnabled: boolean;
    reminderHoursBefore: number;
    cancellationEnabled: boolean;
    rescheduleEnabled: boolean;
    botEnabled: boolean;
    economyMode: boolean;
    bookingLinkFirst: boolean;
    spamFilterEnabled: boolean;
    aiFallbackEnabled: boolean;
    greetingText: string;
    handoffText: string;
    humanTakeoverMinutes: number;
    planCode: string;
    monthlyMessageLimit: number;
    templateLanguage: string;
  };
  usage: {
    sentThisMonth: number;
    remainingThisMonth: number;
  };
  humanHandoffs: Array<{
    phone: string;
    lastInboundPreview: string;
    humanRequestedAt: string | null;
    lastInboundAt: string | null;
  }>;
};

const defaultSettings = {
  enabled: false,
  confirmationEnabled: true,
  reminderEnabled: true,
  reminderHoursBefore: 3,
  cancellationEnabled: true,
  rescheduleEnabled: true,
  botEnabled: false,
  economyMode: true,
  bookingLinkFirst: true,
  spamFilterEnabled: true,
  aiFallbackEnabled: true,
  greetingText: "",
  handoffText: "",
  humanTakeoverMinutes: 120,
  planCode: "off",
  monthlyMessageLimit: 0,
  confirmationTemplate: "ca_booking_confirmed",
  reminderTemplate: "ca_booking_reminder",
  cancellationTemplate: "ca_booking_cancelled",
  rescheduleTemplate: "ca_booking_rescheduled",
  templateLanguage: "pt_BR",
};

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function normalizeTemplateName(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,120}$/.test(normalized) ? normalized : fallback;
}

async function settingsForOrganization(organizationId: number) {
  const db = await getDb();
  const stored = (await db.select().from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, organizationId)).limit(1))[0];
  return stored ?? { organizationId, ...defaultSettings, updatedAt: "" };
}

async function connectionForOrganization(organizationId: number) {
  const db = await getDb();
  return (await db.select().from(whatsappConnections).where(eq(whatsappConnections.organizationId, organizationId)).limit(1))[0] ?? null;
}

async function sentCountThisMonth(organizationId: number) {
  const db = await getDb();
  const row = (await db.select({
    count: sql<number>`count(*)`,
  }).from(whatsappMessages).where(and(
    eq(whatsappMessages.organizationId, organizationId),
    eq(whatsappMessages.direction, "outbound"),
    gte(whatsappMessages.sentAt, monthStartIso()),
    or(
      eq(whatsappMessages.status, "sent"),
      eq(whatsappMessages.status, "delivered"),
      eq(whatsappMessages.status, "read"),
    ),
  )).limit(1))[0];
  return Number(row?.count ?? 0);
}

async function humanHandoffsForOrganization(organizationId: number) {
  const db = await getDb();
  return db.select({
    phone: whatsappConversations.phone,
    lastInboundPreview: whatsappConversations.lastInboundPreview,
    humanRequestedAt: whatsappConversations.humanRequestedAt,
    lastInboundAt: whatsappConversations.lastInboundAt,
  }).from(whatsappConversations).where(and(
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.pauseReason, "human_takeover"),
    isNull(whatsappConversations.automationPausedUntil),
  )).orderBy(desc(whatsappConversations.humanRequestedAt), desc(whatsappConversations.lastInboundAt)).limit(12);
}

export async function getWhatsappAutomationStatus(access: AccessContext): Promise<WhatsappAutomationStatus> {
  requireOwner(access);
  const [settings, connection, sentThisMonth, humanHandoffs] = await Promise.all([
    settingsForOrganization(access.organizationId),
    connectionForOrganization(access.organizationId),
    sentCountThisMonth(access.organizationId),
    humanHandoffsForOrganization(access.organizationId),
  ]);
  const monthlyMessageLimit = Math.max(0, Number(settings.monthlyMessageLimit ?? 0));
  return {
    connection: {
      status: connection?.status ?? "disconnected",
      provider: connection?.provider ?? "meta_cloud",
      wabaId: connection?.wabaId ?? "",
      phoneNumberId: connection?.phoneNumberId ?? "",
      displayPhoneNumber: connection?.displayPhoneNumber ?? "",
      verifiedName: connection?.verifiedName ?? "",
      onboardingMode: connection?.onboardingMode ?? "cloud",
      tokenExpiresAt: connection?.tokenExpiresAt ?? null,
      webhookSubscribedAt: connection?.webhookSubscribedAt ?? null,
      registeredAt: connection?.registeredAt ?? null,
      connectedAt: connection?.connectedAt ?? null,
      updatedAt: connection?.updatedAt ?? null,
    },
    settings: {
      enabled: Boolean(settings.enabled),
      confirmationEnabled: Boolean(settings.confirmationEnabled),
      reminderEnabled: Boolean(settings.reminderEnabled),
      reminderHoursBefore: Number(settings.reminderHoursBefore ?? 3),
      cancellationEnabled: Boolean(settings.cancellationEnabled),
      rescheduleEnabled: Boolean(settings.rescheduleEnabled),
      botEnabled: Boolean(settings.botEnabled),
      economyMode: Boolean(settings.economyMode),
      bookingLinkFirst: Boolean(settings.bookingLinkFirst),
      spamFilterEnabled: Boolean(settings.spamFilterEnabled),
      aiFallbackEnabled: Boolean(settings.aiFallbackEnabled),
      greetingText: String(settings.greetingText ?? ""),
      handoffText: String(settings.handoffText ?? ""),
      humanTakeoverMinutes: Number(settings.humanTakeoverMinutes ?? 120),
      planCode: String(settings.planCode ?? "off"),
      monthlyMessageLimit,
      templateLanguage: String(settings.templateLanguage ?? "pt_BR"),
    },
    usage: {
      sentThisMonth,
      remainingThisMonth: Math.max(0, monthlyMessageLimit - sentThisMonth),
    },
    humanHandoffs,
  };
}

export async function saveWhatsappAutomationSettings(access: AccessContext, input: {
  enabled?: boolean;
  confirmationEnabled?: boolean;
  reminderEnabled?: boolean;
  reminderHoursBefore?: number;
  cancellationEnabled?: boolean;
  rescheduleEnabled?: boolean;
  botEnabled?: boolean;
  economyMode?: boolean;
  bookingLinkFirst?: boolean;
  spamFilterEnabled?: boolean;
  aiFallbackEnabled?: boolean;
  greetingText?: string;
  handoffText?: string;
  humanTakeoverMinutes?: number;
}) {
  requireOwner(access);
  const current = await settingsForOrganization(access.organizationId);
  const reminderHoursBefore = input.reminderHoursBefore === undefined ? Number(current.reminderHoursBefore) : Math.round(Number(input.reminderHoursBefore));
  const humanTakeoverMinutes = input.humanTakeoverMinutes === undefined ? Number(current.humanTakeoverMinutes) : Math.round(Number(input.humanTakeoverMinutes));
  if (!Number.isFinite(reminderHoursBefore) || reminderHoursBefore < 1 || reminderHoursBefore > 72) throw new Error("Escolha um lembrete entre 1 e 72 horas antes.");
  if (!Number.isFinite(humanTakeoverMinutes) || humanTakeoverMinutes < 15 || humanTakeoverMinutes > 1440) throw new Error("Escolha uma pausa humana entre 15 minutos e 24 horas.");

  const db = await getDb();
  const now = new Date().toISOString();
  const values = {
    organizationId: access.organizationId,
    enabled: input.enabled ?? Boolean(current.enabled),
    confirmationEnabled: input.confirmationEnabled ?? Boolean(current.confirmationEnabled),
    reminderEnabled: input.reminderEnabled ?? Boolean(current.reminderEnabled),
    reminderHoursBefore,
    cancellationEnabled: input.cancellationEnabled ?? Boolean(current.cancellationEnabled),
    rescheduleEnabled: input.rescheduleEnabled ?? Boolean(current.rescheduleEnabled),
    botEnabled: input.botEnabled ?? Boolean(current.botEnabled),
    economyMode: input.economyMode ?? Boolean(current.economyMode),
    bookingLinkFirst: input.bookingLinkFirst ?? Boolean(current.bookingLinkFirst),
    spamFilterEnabled: input.spamFilterEnabled ?? Boolean(current.spamFilterEnabled),
    aiFallbackEnabled: input.aiFallbackEnabled ?? Boolean(current.aiFallbackEnabled),
    greetingText: input.greetingText === undefined ? String(current.greetingText ?? "") : input.greetingText.trim().slice(0, 700),
    handoffText: input.handoffText === undefined ? String(current.handoffText ?? "") : input.handoffText.trim().slice(0, 500),
    humanTakeoverMinutes,
    planCode: String(current.planCode ?? "off"),
    monthlyMessageLimit: Number(current.monthlyMessageLimit ?? 0),
    confirmationTemplate: String(current.confirmationTemplate ?? defaultSettings.confirmationTemplate),
    reminderTemplate: String(current.reminderTemplate ?? defaultSettings.reminderTemplate),
    cancellationTemplate: String(current.cancellationTemplate ?? defaultSettings.cancellationTemplate),
    rescheduleTemplate: String(current.rescheduleTemplate ?? defaultSettings.rescheduleTemplate),
    templateLanguage: String(current.templateLanguage ?? defaultSettings.templateLanguage),
    updatedAt: now,
  };
  await db.insert(whatsappAutomationSettings).values(values).onConflictDoUpdate({
    target: whatsappAutomationSettings.organizationId,
    set: {
      enabled: values.enabled,
      confirmationEnabled: values.confirmationEnabled,
      reminderEnabled: values.reminderEnabled,
      reminderHoursBefore: values.reminderHoursBefore,
      cancellationEnabled: values.cancellationEnabled,
      rescheduleEnabled: values.rescheduleEnabled,
      botEnabled: values.botEnabled,
      economyMode: values.economyMode,
      bookingLinkFirst: values.bookingLinkFirst,
      spamFilterEnabled: values.spamFilterEnabled,
      aiFallbackEnabled: values.aiFallbackEnabled,
      greetingText: values.greetingText,
      handoffText: values.handoffText,
      humanTakeoverMinutes: values.humanTakeoverMinutes,
      planCode: values.planCode,
      monthlyMessageLimit: values.monthlyMessageLimit,
      confirmationTemplate: values.confirmationTemplate,
      reminderTemplate: values.reminderTemplate,
      cancellationTemplate: values.cancellationTemplate,
      rescheduleTemplate: values.rescheduleTemplate,
      templateLanguage: values.templateLanguage,
      updatedAt: values.updatedAt,
    },
  });
  return getWhatsappAutomationStatus(access);
}

export async function saveWhatsappPlanForOrganization(access: AccessContext, input: {
  organizationId: number;
  planCode: string;
  monthlyMessageLimit: number;
}) {
  requirePlatformAdmin(access);
  const organizationId = Math.round(Number(input.organizationId));
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error("Barbearia inválida.");
  const current = await settingsForOrganization(organizationId);
  const monthlyMessageLimit = Math.round(Number(input.monthlyMessageLimit));
  if (!Number.isFinite(monthlyMessageLimit) || monthlyMessageLimit < 0 || monthlyMessageLimit > 100000) throw new Error("Limite mensal de mensagens inválido.");
  const planCode = input.planCode.trim().toLowerCase().slice(0, 40) || "off";
  const db = await getDb();
  const now = new Date().toISOString();
  await db.insert(whatsappAutomationSettings).values({
    organizationId,
    ...defaultSettings,
    enabled: Boolean(current.enabled),
    confirmationEnabled: Boolean(current.confirmationEnabled),
    reminderEnabled: Boolean(current.reminderEnabled),
    reminderHoursBefore: Number(current.reminderHoursBefore),
    cancellationEnabled: Boolean(current.cancellationEnabled),
    rescheduleEnabled: Boolean(current.rescheduleEnabled),
    botEnabled: Boolean(current.botEnabled),
    humanTakeoverMinutes: Number(current.humanTakeoverMinutes),
    planCode,
    monthlyMessageLimit,
    confirmationTemplate: String(current.confirmationTemplate),
    reminderTemplate: String(current.reminderTemplate),
    cancellationTemplate: String(current.cancellationTemplate),
    rescheduleTemplate: String(current.rescheduleTemplate),
    templateLanguage: String(current.templateLanguage),
    updatedAt: now,
  }).onConflictDoUpdate({
    target: whatsappAutomationSettings.organizationId,
    set: { planCode, monthlyMessageLimit, updatedAt: now },
  });
}

export type WhatsappEmbeddedSignupClientConfig = {
  ready: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  missing: string[];
  supportsCoexistence: boolean;
};

function metaEnvironment() {
  return {
    appId: String(process.env.WHATSAPP_APP_ID ?? "").trim(),
    appSecret: String(process.env.WHATSAPP_APP_SECRET ?? "").trim(),
    configId: String(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID ?? "").trim(),
    graphVersion: String(process.env.WHATSAPP_GRAPH_VERSION ?? "").trim(),
  };
}

export function getWhatsappEmbeddedSignupClientConfig(): WhatsappEmbeddedSignupClientConfig {
  const config = metaEnvironment();
  const missing: string[] = [];
  if (!/^\d{5,30}$/.test(config.appId)) missing.push("Meta App ID");
  if (config.appSecret.length < 20) missing.push("Meta App Secret");
  if (!/^\d{5,40}$/.test(config.configId)) missing.push("Embedded Signup Config ID");
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) missing.push("Graph API Version");
  const ready = missing.length === 0;
  return {
    ready,
    appId: ready ? config.appId : "",
    configId: ready ? config.configId : "",
    graphVersion: /^v\d+\.\d+$/.test(config.graphVersion) ? config.graphVersion : "",
    missing,
    supportsCoexistence: true,
  };
}

function requiredMetaEnvironment() {
  const publicConfig = getWhatsappEmbeddedSignupClientConfig();
  const config = metaEnvironment();
  if (!publicConfig.ready) throw new Error("A integração oficial da Meta ainda não foi configurada no Cortou Anotou.");
  return config;
}

type MetaErrorShape = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
  };
};

async function metaResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & MetaErrorShape;
  if (!response.ok) {
    const details = body.error?.error_data?.details || body.error?.message || fallback;
    throw new Error(String(details).slice(0, 500));
  }
  return body;
}

async function exchangeWhatsappSignupCode(code: string) {
  const config = requiredMetaEnvironment();
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("code", code);
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const body = await metaResponse<{ access_token?: string; token_type?: string; expires_in?: number }>(response, "A Meta não autorizou a conexão.");
  const accessToken = String(body.access_token ?? "");
  if (accessToken.length < 40 || accessToken.length > 2000) throw new Error("A Meta não devolveu um token válido para o WhatsApp.");
  const expiresIn = Number(body.expires_in ?? 0);
  return {
    accessToken,
    tokenExpiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

async function validateWhatsappSignupToken(accessToken: string, wabaId: string) {
  const config = requiredMetaEnvironment();
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { authorization: `Bearer ${config.appId}|${config.appSecret}` },
  });
  const body = await metaResponse<{
    data?: {
      app_id?: string;
      is_valid?: boolean;
      scopes?: string[];
      granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
    };
  }>(response, "Não foi possível validar a autorização da Meta.");
  const debug = body.data;
  if (!debug?.is_valid || String(debug.app_id ?? "") !== config.appId) throw new Error("A autorização recebida da Meta não pertence ao Cortou Anotou.");
  const scopes = new Set(debug.scopes ?? []);
  if (!scopes.has("whatsapp_business_management")) throw new Error("A Meta não liberou a permissão de gerenciamento do WhatsApp Business.");
  if (!scopes.has("whatsapp_business_messaging")) throw new Error("A Meta não liberou a permissão para enviar mensagens pelo WhatsApp.");

  const targetIds = new Set(
    (debug.granular_scopes ?? [])
      .filter((item) => item.scope === "whatsapp_business_management" || item.scope === "whatsapp_business_messaging")
      .flatMap((item) => item.target_ids ?? []),
  );
  if (targetIds.size > 0 && !targetIds.has(wabaId)) throw new Error("A conta do WhatsApp selecionada não faz parte da autorização concluída na Meta.");
}

async function readWhatsappPhoneFromMeta(accessToken: string, wabaId: string, phoneNumberId: string) {
  const config = requiredMetaEnvironment();
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(wabaId)}/phone_numbers`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
  const response = await fetch(url, {
    cache: "no-store",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await metaResponse<{
    data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>;
  }>(response, "Não foi possível consultar o número selecionado na Meta.");
  const phone = (body.data ?? []).find((item) => String(item.id ?? "") === phoneNumberId);
  if (!phone) throw new Error("O número selecionado não pertence à conta do WhatsApp autorizada.");
  return {
    displayPhoneNumber: String(phone.display_phone_number ?? "").slice(0, 40),
    verifiedName: String(phone.verified_name ?? "").slice(0, 120),
  };
}

async function subscribeWhatsappWebhook(accessToken: string, wabaId: string) {
  const config = requiredMetaEnvironment();
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await metaResponse<{ success?: boolean }>(response, "Não foi possível ativar os webhooks do WhatsApp.");
  if (body.success !== true) throw new Error("A Meta não confirmou a assinatura dos webhooks desta conta.");
}

async function registerWhatsappPhone(accessToken: string, phoneNumberId: string, pin: string) {
  const config = requiredMetaEnvironment();
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(phoneNumberId)}/register`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  const body = await metaResponse<{ success?: boolean }>(response, "Não foi possível registrar o número na Cloud API.");
  if (body.success !== true) throw new Error("A Meta não confirmou o registro do número.");
}

function secureRegistrationPin() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

export async function completeWhatsappEmbeddedSignup(access: AccessContext, input: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  mode: "cloud" | "coexistence";
}) {
  requireOwner(access);
  const code = input.code.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  const mode = input.mode === "coexistence" ? "coexistence" : "cloud";
  if (code.length < 10 || code.length > 2000) throw new Error("A autorização recebida da Meta é inválida ou expirou.");
  if (!/^\d{5,30}$/.test(wabaId)) throw new Error("A Meta não informou uma conta WhatsApp válida.");
  if (!/^\d{5,30}$/.test(phoneNumberId)) throw new Error("A Meta não informou um número WhatsApp válido.");

  const db = await getDb();
  const occupied = (await db.select({ organizationId: whatsappConnections.organizationId }).from(whatsappConnections).where(eq(whatsappConnections.phoneNumberId, phoneNumberId)).limit(1))[0];
  if (occupied && occupied.organizationId !== access.organizationId) throw new Error("Este número já está conectado a outra barbearia no Cortou Anotou.");

  const exchanged = await exchangeWhatsappSignupCode(code);
  await validateWhatsappSignupToken(exchanged.accessToken, wabaId);
  const phone = await readWhatsappPhoneFromMeta(exchanged.accessToken, wabaId, phoneNumberId);
  await subscribeWhatsappWebhook(exchanged.accessToken, wabaId);

  let encryptedRegistrationPin = "";
  let registrationPinIv = "";
  const now = new Date().toISOString();
  if (mode === "cloud") {
    const pin = secureRegistrationPin();
    await registerWhatsappPhone(exchanged.accessToken, phoneNumberId, pin);
    const protectedPin = await encryptSecret(pin);
    encryptedRegistrationPin = protectedPin.encryptedValue;
    registrationPinIv = protectedPin.initializationVector;
  }

  const protectedToken = await encryptSecret(exchanged.accessToken);
  await db.insert(whatsappConnections).values({
    organizationId: access.organizationId,
    provider: "meta_cloud",
    status: "connected",
    onboardingMode: mode,
    wabaId,
    phoneNumberId,
    displayPhoneNumber: phone.displayPhoneNumber,
    verifiedName: phone.verifiedName,
    encryptedAccessToken: protectedToken.encryptedValue,
    accessTokenIv: protectedToken.initializationVector,
    tokenExpiresAt: exchanged.tokenExpiresAt,
    encryptedRegistrationPin,
    registrationPinIv,
    webhookSubscribedAt: now,
    registeredAt: now,
    connectedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: whatsappConnections.organizationId,
    set: {
      provider: "meta_cloud",
      status: "connected",
      onboardingMode: mode,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.displayPhoneNumber,
      verifiedName: phone.verifiedName,
      encryptedAccessToken: protectedToken.encryptedValue,
      accessTokenIv: protectedToken.initializationVector,
      tokenExpiresAt: exchanged.tokenExpiresAt,
      encryptedRegistrationPin,
      registrationPinIv,
      webhookSubscribedAt: now,
      registeredAt: now,
      connectedAt: now,
      updatedAt: now,
    },
  });

  return getWhatsappAutomationStatus(access);
}

export async function disconnectWhatsapp(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  const connection = await connectionForOrganization(access.organizationId);
  if (connection?.status === "connected" && connection.encryptedAccessToken && connection.accessTokenIv && connection.wabaId) {
    try {
      const accessToken = await decryptSecret(connection.encryptedAccessToken, connection.accessTokenIv);
      const config = requiredMetaEnvironment();
      await fetch(`https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(connection.wabaId)}/subscribed_apps`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      console.error("WhatsApp webhook unsubscribe failed", error);
    }
  }
  await db.update(whatsappConnections).set({
    status: "disconnected",
    encryptedAccessToken: "",
    accessTokenIv: "",
    tokenExpiresAt: null,
    encryptedRegistrationPin: "",
    registrationPinIv: "",
    webhookSubscribedAt: null,
    registeredAt: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(whatsappConnections.organizationId, access.organizationId));
  await db.update(whatsappAutomationSettings).set({
    enabled: false,
    updatedAt: new Date().toISOString(),
  }).where(eq(whatsappAutomationSettings.organizationId, access.organizationId));
}

async function appointmentContext(appointmentId: number) {
  const db = await getDb();
  return (await db.select({
    id: appointments.id,
    organizationId: appointments.organizationId,
    appointmentDate: appointments.appointmentDate,
    appointmentTime: appointments.appointmentTime,
    clientName: appointments.clientName,
    phone: appointments.phone,
    status: appointments.status,
    organizationName: organizations.name,
    serviceName: services.name,
    barberName: team.name,
  }).from(appointments)
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(team, eq(team.id, appointments.barberId))
    .where(eq(appointments.id, appointmentId))
    .limit(1))[0] ?? null;
}

function eventEnabled(settings: Awaited<ReturnType<typeof settingsForOrganization>>, kind: WhatsappAutomationKind) {
  if (!settings.enabled) return false;
  if (kind === "confirmation") return Boolean(settings.confirmationEnabled);
  if (kind === "reminder") return Boolean(settings.reminderEnabled);
  if (kind === "cancellation") return Boolean(settings.cancellationEnabled);
  return Boolean(settings.rescheduleEnabled);
}

function templateFor(settings: Awaited<ReturnType<typeof settingsForOrganization>>, kind: WhatsappAutomationKind) {
  if (kind === "confirmation") return normalizeTemplateName(String(settings.confirmationTemplate), defaultSettings.confirmationTemplate);
  if (kind === "reminder") return normalizeTemplateName(String(settings.reminderTemplate), defaultSettings.reminderTemplate);
  if (kind === "cancellation") return normalizeTemplateName(String(settings.cancellationTemplate), defaultSettings.cancellationTemplate);
  return normalizeTemplateName(String(settings.rescheduleTemplate), defaultSettings.rescheduleTemplate);
}

async function cancelPendingAppointmentMessages(organizationId: number, appointmentId: number, kinds: WhatsappAutomationKind[]) {
  const db = await getDb();
  if (!kinds.length) return;
  await db.update(whatsappMessages).set({
    status: "cancelled",
    errorText: "Substituída por uma alteração posterior do agendamento.",
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(whatsappMessages.organizationId, organizationId),
    eq(whatsappMessages.appointmentId, appointmentId),
    eq(whatsappMessages.status, "queued"),
    or(...kinds.map((kind) => eq(whatsappMessages.kind, kind))),
  ));
}

async function enqueueMessage(kind: WhatsappAutomationKind, appointment: NonNullable<Awaited<ReturnType<typeof appointmentContext>>>, settings: Awaited<ReturnType<typeof settingsForOrganization>>, scheduledAt: string) {
  if (!eventEnabled(settings, kind)) return false;
  const phone = normalizeWhatsappPhone(appointment.phone);
  if (!phone) return false;
  const db = await getDb();
  const templateName = templateFor(settings, kind);
  const dedupeKey = `${kind}:${appointment.id}:${appointment.appointmentDate}:${appointment.appointmentTime}`;
  const payload = {
    organizationName: appointment.organizationName,
    clientName: appointment.clientName,
    serviceName: appointment.serviceName,
    barberName: appointment.barberName,
    date: appointment.appointmentDate,
    time: appointment.appointmentTime,
  };
  const inserted = await db.insert(whatsappMessages).values({
    organizationId: appointment.organizationId,
    appointmentId: appointment.id,
    direction: "outbound",
    kind,
    phone,
    templateName,
    dedupeKey,
    status: "queued",
    scheduledAt,
    payloadJson: JSON.stringify(payload),
    updatedAt: new Date().toISOString(),
  }).onConflictDoNothing().returning({ id: whatsappMessages.id });
  return Boolean(inserted[0]?.id);
}

export async function queueAppointmentWhatsapp(kind: Exclude<WhatsappAutomationKind, "reminder">, appointmentId: number) {
  const appointment = await appointmentContext(appointmentId);
  if (!appointment) return { queued: false, reason: "appointment_not_found" as const };
  const [settings, connection] = await Promise.all([
    settingsForOrganization(appointment.organizationId),
    connectionForOrganization(appointment.organizationId),
  ]);

  // Alterações do agendamento sempre invalidam mensagens antigas, mesmo se a automação
  // estiver temporariamente desligada ou a conexão da Meta estiver indisponível.
  if (kind === "cancellation") {
    await cancelPendingAppointmentMessages(appointment.organizationId, appointment.id, ["confirmation", "reminder", "rescheduled"]);
  }
  if (kind === "rescheduled") {
    await cancelPendingAppointmentMessages(appointment.organizationId, appointment.id, ["reminder", "rescheduled"]);
  }

  if (!settings.enabled || !connection || connection.status !== "connected" || Number(settings.monthlyMessageLimit) <= 0) {
    return { queued: false, reason: "automation_inactive" as const };
  }

  const now = new Date().toISOString();
  const mainQueued = await enqueueMessage(kind, appointment, settings, now);

  if ((kind === "confirmation" || kind === "rescheduled") && settings.reminderEnabled) {
    const reminderAt = whatsappReminderAt(appointment.appointmentDate, appointment.appointmentTime, Number(settings.reminderHoursBefore));
    if (reminderAt) await enqueueMessage("reminder", appointment, settings, reminderAt);
  }

  return { queued: mainQueued, reason: mainQueued ? "queued" as const : "duplicate_or_disabled" as const };
}

export async function queueAppointmentWhatsappSafely(kind: Exclude<WhatsappAutomationKind, "reminder">, appointmentId: number) {
  try {
    return await queueAppointmentWhatsapp(kind, appointmentId);
  } catch (error) {
    console.error("WhatsApp automation queue failed", error);
    return { queued: false, reason: "queue_error" as const };
  }
}

export async function queueWhatsappTextReply(input: {
  organizationId: number;
  phone: string;
  text: string;
  inboundProviderMessageId: string;
}) {
  const phone = normalizeWhatsappPhone(input.phone);
  const text = input.text.trim().replace(/\n{3,}/g, "\n\n").slice(0, 3500);
  if (!phone || !text || !input.inboundProviderMessageId) return { queued:false, reason:"invalid" as const };
  const [settings, connection] = await Promise.all([
    settingsForOrganization(input.organizationId),
    connectionForOrganization(input.organizationId),
  ]);
  if (!settings.enabled || !settings.botEnabled || !connection || connection.status !== "connected" || Number(settings.monthlyMessageLimit) <= 0) {
    return { queued:false, reason:"automation_inactive" as const };
  }
  const db = await getDb();
  const now = new Date().toISOString();
  const inserted = await db.insert(whatsappMessages).values({
    organizationId: input.organizationId,
    appointmentId: null,
    direction: "outbound",
    kind: "bot_text",
    phone,
    templateName: "",
    dedupeKey: `bot:${input.inboundProviderMessageId}`,
    status: "queued",
    scheduledAt: now,
    payloadJson: JSON.stringify({ text }),
    updatedAt: now,
  }).onConflictDoNothing().returning({ id: whatsappMessages.id });
  return { queued:Boolean(inserted[0]?.id), reason:inserted[0]?.id ? "queued" as const : "duplicate" as const };
}

function graphVersion() {
  const value = String(process.env.WHATSAPP_GRAPH_VERSION ?? "").trim();
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("Configure WHATSAPP_GRAPH_VERSION antes de enviar mensagens.");
  return value;
}

function templateParameters(kind: WhatsappAutomationKind, payload: Record<string, string>) {
  const values = kind === "cancellation"
    ? [payload.clientName, payload.date, payload.time, payload.serviceName]
    : [payload.clientName, payload.date, payload.time, payload.serviceName, payload.barberName];
  return values.map((text) => ({ type: "text", text: String(text ?? "").slice(0, 1000) }));
}

async function sendQueuedMessage(message: typeof whatsappMessages.$inferSelect) {
  const [connection, settings] = await Promise.all([
    connectionForOrganization(message.organizationId),
    settingsForOrganization(message.organizationId),
  ]);
  if (!settings.enabled || !connection || connection.status !== "connected" || !connection.encryptedAccessToken || !connection.accessTokenIv) {
    throw new Error("A conexão do WhatsApp desta barbearia não está ativa.");
  }
  const sentThisMonth = await sentCountThisMonth(message.organizationId);
  if (sentThisMonth >= Number(settings.monthlyMessageLimit)) throw new Error("O limite mensal de mensagens desta barbearia foi atingido.");

  const token = await decryptSecret(connection.encryptedAccessToken, connection.accessTokenIv);
  const payload = JSON.parse(message.payloadJson || "{}") as Record<string, string>;
  const messageBody = message.kind === "bot_text"
    ? {
      messaging_product: "whatsapp",
      to: message.phone,
      type: "text",
      text: { preview_url: false, body: String(payload.text ?? "").slice(0,3500) },
    }
    : {
      messaging_product: "whatsapp",
      to: message.phone,
      type: "template",
      template: {
        name: message.templateName,
        language: { code: String(settings.templateLanguage ?? "pt_BR") },
        components: [{ type: "body", parameters: templateParameters(message.kind as WhatsappAutomationKind, payload) }],
      },
    };
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(connection.phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(messageBody),
  });
  const result = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number; error_data?: { details?: string } };
  };
  const providerMessageId = result.messages?.[0]?.id;
  if (!response.ok || !providerMessageId) {
    const details = result.error?.error_data?.details || result.error?.message || `Meta respondeu HTTP ${response.status}`;
    throw new Error(details.slice(0, 500));
  }
  return providerMessageId;
}

export async function processWhatsappQueue(options: { organizationId?: number; limit?: number } = {}) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(50, Math.round(Number(options.limit ?? 20))));
  const now = new Date().toISOString();
  const condition = options.organizationId
    ? and(eq(whatsappMessages.organizationId, options.organizationId), eq(whatsappMessages.status, "queued"), lte(whatsappMessages.scheduledAt, now))
    : and(eq(whatsappMessages.status, "queued"), lte(whatsappMessages.scheduledAt, now));
  const queue = await db.select().from(whatsappMessages).where(condition).orderBy(whatsappMessages.scheduledAt, whatsappMessages.id).limit(limit);
  let sent = 0;
  let failed = 0;
  for (const message of queue) {
    const claimedAt = new Date().toISOString();
    const claimed = await db.update(whatsappMessages).set({
      status: "sending",
      updatedAt: claimedAt,
    }).where(and(eq(whatsappMessages.id, message.id), eq(whatsappMessages.status, "queued"))).returning({ id: whatsappMessages.id });
    if (!claimed[0]?.id) continue;
    try {
      const providerMessageId = await sendQueuedMessage({ ...message, status:"sending", updatedAt:claimedAt });
      const sentAt = new Date().toISOString();
      await db.update(whatsappMessages).set({
        providerMessageId,
        status: "sent",
        sentAt,
        errorText: "",
        updatedAt: sentAt,
      }).where(and(eq(whatsappMessages.id, message.id), eq(whatsappMessages.status, "sending")));
      await db.insert(whatsappConversations).values({
        organizationId: message.organizationId,
        phone: message.phone,
        lastOutboundAt: sentAt,
        updatedAt: sentAt,
      }).onConflictDoUpdate({
        target: [whatsappConversations.organizationId, whatsappConversations.phone],
        set: { lastOutboundAt: sentAt, updatedAt: sentAt },
      });
      sent += 1;
    } catch (error) {
      const failedAt = new Date().toISOString();
      await db.update(whatsappMessages).set({
        status: "failed",
        failedAt,
        errorText: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida ao enviar.",
        updatedAt: failedAt,
      }).where(and(eq(whatsappMessages.id, message.id), eq(whatsappMessages.status, "sending")));
      failed += 1;
    }
  }
  return { processed: queue.length, sent, failed };
}

export async function processWhatsappQueueSafely(organizationId?: number, limit = 5) {
  try {
    return await processWhatsappQueue({ organizationId, limit });
  } catch (error) {
    console.error("WhatsApp automation send failed", error);
    return { processed: 0, sent: 0, failed: 0 };
  }
}

export async function pauseWhatsappConversation(access: AccessContext, phoneValue: string, minutes?: number) {
  requireOwner(access);
  const phone = normalizeWhatsappPhone(phoneValue);
  if (!phone) throw new Error("Telefone inválido.");
  const settings = await settingsForOrganization(access.organizationId);
  const duration = Math.max(15, Math.min(1440, Math.round(Number(minutes ?? settings.humanTakeoverMinutes))));
  const pausedUntil = new Date(Date.now() + duration * 60_000).toISOString();
  const db = await getDb();
  await db.insert(whatsappConversations).values({
    organizationId: access.organizationId,
    phone,
    automationPausedUntil: pausedUntil,
    pauseReason: "human_takeover",
    updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [whatsappConversations.organizationId, whatsappConversations.phone],
    set: { automationPausedUntil: pausedUntil, pauseReason: "human_takeover", updatedAt: new Date().toISOString() },
  });
  return pausedUntil;
}

export async function resumeWhatsappConversation(access: AccessContext, phoneValue: string) {
  requireOwner(access);
  const phone = normalizeWhatsappPhone(phoneValue);
  if (!phone) throw new Error("Telefone inválido.");
  const db = await getDb();
  await db.update(whatsappConversations).set({
    automationPausedUntil: null,
    pauseReason: "",
    botState: "",
    botContextJson: "{}",
    humanRequestedAt: null,
    unresolvedTurns: 0,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(whatsappConversations.organizationId, access.organizationId), eq(whatsappConversations.phone, phone)));
}

export async function isWhatsappConversationPaused(organizationId: number, phoneValue: string) {
  const phone = normalizeWhatsappPhone(phoneValue);
  if (!phone) return true;
  const db = await getDb();
  const conversation = (await db.select().from(whatsappConversations).where(and(
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.phone, phone),
  )).limit(1))[0];
  if (!conversation) return false;
  if (conversation.pauseReason === "human_takeover" && !conversation.automationPausedUntil) return true;
  return Boolean(conversation.automationPausedUntil && conversation.automationPausedUntil > new Date().toISOString());
}

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } }>;
        statuses?: Array<{ id?: string; status?: string; timestamp?: string; errors?: Array<{ title?: string; message?: string; error_data?: { details?: string } }> }>;
      };
    }>;
  }>;
};

function timestampIso(value?: string) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

export type WhatsappInboundTextEvent = {
  organizationId: number;
  messageRowId: number;
  providerMessageId: string;
  phone: string;
  text: string;
  receivedAt: string;
};

export async function handleWhatsappWebhook(payload: MetaWebhookPayload) {
  const db = await getDb();
  let received = 0;
  let statuses = 0;
  const inboundTextEvents: WhatsappInboundTextEvent[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
      if (!phoneNumberId) continue;
      const connection = (await db.select().from(whatsappConnections).where(eq(whatsappConnections.phoneNumberId, phoneNumberId)).limit(1))[0];
      if (!connection) continue;

      for (const message of value?.messages ?? []) {
        const providerMessageId = String(message.id ?? "");
        const phone = normalizeWhatsappPhone(String(message.from ?? ""));
        if (!providerMessageId || !phone) continue;
        const receivedAt = timestampIso(message.timestamp);
        const inserted = await db.insert(whatsappMessages).values({
          organizationId: connection.organizationId,
          appointmentId: null,
          direction: "inbound",
          kind: message.type === "text" ? "inbound_text" : `inbound_${String(message.type ?? "unknown")}`,
          phone,
          dedupeKey: `inbound:${providerMessageId}`,
          providerMessageId,
          status: "received",
          scheduledAt: receivedAt,
          sentAt: receivedAt,
          payloadJson: JSON.stringify(message),
          updatedAt: receivedAt,
        }).onConflictDoNothing().returning({ id: whatsappMessages.id });
        if (!inserted[0]?.id) continue;
        const preview = String(message.text?.body ?? "").trim().slice(0,240);
        await db.insert(whatsappConversations).values({
          organizationId: connection.organizationId,
          phone,
          lastInboundAt: receivedAt,
          lastInboundPreview: preview,
          updatedAt: receivedAt,
        }).onConflictDoUpdate({
          target: [whatsappConversations.organizationId, whatsappConversations.phone],
          set: { lastInboundAt: receivedAt, lastInboundPreview: preview, updatedAt: receivedAt },
        });
        if (message.type === "text" && preview) inboundTextEvents.push({
          organizationId: connection.organizationId,
          messageRowId: inserted[0].id,
          providerMessageId,
          phone,
          text: preview,
          receivedAt,
        });
        received += 1;
      }

      for (const status of value?.statuses ?? []) {
        const providerMessageId = String(status.id ?? "");
        if (!providerMessageId) continue;
        const state = String(status.status ?? "");
        const occurredAt = timestampIso(status.timestamp);
        const errorText = status.errors?.map((error) => error.error_data?.details || error.message || error.title || "").filter(Boolean).join(" · ").slice(0, 500) ?? "";
        const update: Partial<typeof whatsappMessages.$inferInsert> = { status: state || "unknown", updatedAt: occurredAt };
        if (state === "delivered") update.deliveredAt = occurredAt;
        if (state === "read") update.readAt = occurredAt;
        if (state === "failed") { update.failedAt = occurredAt; update.errorText = errorText; }
        await db.update(whatsappMessages).set(update).where(and(
          eq(whatsappMessages.organizationId, connection.organizationId),
          eq(whatsappMessages.providerMessageId, providerMessageId),
        ));
        statuses += 1;
      }
    }
  }
  return { received, statuses, inboundTextEvents };
}
