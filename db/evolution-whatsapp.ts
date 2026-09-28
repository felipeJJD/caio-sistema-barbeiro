import { and, eq, lte, or } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { decryptSecret } from "./platform-secrets";
import {
  whatsappAutomationSettings,
  whatsappConnections,
  whatsappConversations,
  whatsappMessages,
} from "./schema";
import { normalizeWhatsappPhone } from "../lib/whatsapp";
import { getWhatsappAutomationStatus, type WhatsappInboundTextEvent } from "./whatsapp";

const META_FALLTHROUGH_ERROR = "A conexão do WhatsApp desta barbearia não está ativa.";
const EVOLUTION_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"] as const;

function evolutionEnvironment() {
  return {
    url: String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/$/, ""),
    apiKey: String(process.env.EVOLUTION_API_KEY ?? "").trim(),
    webhookSecret: String(process.env.EVOLUTION_WEBHOOK_SECRET ?? "").trim(),
  };
}

export function getEvolutionClientConfig() {
  const config = evolutionEnvironment();
  const missing: string[] = [];
  if (!/^https:\/\//.test(config.url)) missing.push("Evolution URL");
  if (config.apiKey.length < 24) missing.push("Evolution API Key");
  if (config.webhookSecret.length < 24) missing.push("Evolution Webhook Secret");
  return { ready: missing.length === 0, missing };
}

function requiredEvolutionEnvironment() {
  const config = evolutionEnvironment();
  const publicConfig = getEvolutionClientConfig();
  if (!publicConfig.ready) throw new Error("A conexão rápida do WhatsApp ainda está sendo preparada.");
  return config;
}

function instanceName(organizationId: number) {
  return `ca-org-${organizationId}`;
}

function webhookUrl() {
  return "https://cortouanotou.com.br/api/whatsapp/evolution/webhook";
}

type EvolutionError = {
  error?: string;
  message?: string | string[];
  response?: { message?: string | string[] };
};

async function evolutionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = requiredEvolutionEnvironment();
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & EvolutionError;
  if (!response.ok) {
    const raw = body.response?.message ?? body.message ?? body.error ?? `Evolution respondeu HTTP ${response.status}`;
    const details = Array.isArray(raw) ? raw.join(" · ") : String(raw);
    throw new Error(details.slice(0, 500));
  }
  return body;
}

async function findEvolutionInstance(name: string) {
  const result = await evolutionRequest<unknown>(`/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`);
  if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined;
  const object = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const data = object.data;
  if (Array.isArray(data)) return data[0] as Record<string, unknown> | undefined;
  return undefined;
}

function pairingCodeFrom(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const body = value as Record<string, unknown>;
  const direct = String(body.pairingCode ?? body.pairing_code ?? "").trim();
  if (direct) return direct;
  const qrcode = body.qrcode;
  if (qrcode && typeof qrcode === "object") {
    const nested = qrcode as Record<string, unknown>;
    return String(nested.pairingCode ?? nested.pairing_code ?? "").trim();
  }
  return "";
}

async function createEvolutionInstance(name: string, phone: string) {
  const config = requiredEvolutionEnvironment();
  return evolutionRequest<Record<string, unknown>>("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: name,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      number: phone,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      webhook: {
        url: webhookUrl(),
        byEvents: false,
        base64: false,
        headers: {
          authorization: `Bearer ${config.webhookSecret}`,
          "Content-Type": "application/json",
        },
        events: [...EVOLUTION_EVENTS],
      },
    }),
  });
}

async function connectEvolutionInstance(name: string, phone: string) {
  return evolutionRequest<Record<string, unknown>>(`/instance/connect/${encodeURIComponent(name)}?number=${encodeURIComponent(phone)}`);
}

async function readEvolutionState(name: string) {
  try {
    const body = await evolutionRequest<Record<string, unknown>>(`/instance/connectionState/${encodeURIComponent(name)}`);
    const nested = body.instance && typeof body.instance === "object" ? body.instance as Record<string, unknown> : {};
    return String(nested.state ?? body.state ?? "").toLowerCase();
  } catch {
    return "";
  }
}

async function updateEvolutionConnectionState(organizationId: number, name: string, state: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  const connected = state === "open" || state === "connected";
  await db.update(whatsappConnections).set({
    status: connected ? "connected" : state === "connecting" ? "connecting" : "disconnected",
    connectedAt: connected ? now : null,
    updatedAt: now,
  }).where(and(
    eq(whatsappConnections.organizationId, organizationId),
    eq(whatsappConnections.provider, "evolution"),
    eq(whatsappConnections.phoneNumberId, name),
  ));
  return connected;
}

export async function refreshEvolutionStatus(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  const connection = (await db.select().from(whatsappConnections).where(eq(whatsappConnections.organizationId, access.organizationId)).limit(1))[0];
  if (!connection || connection.provider !== "evolution" || !connection.phoneNumberId) {
    return { state: "disconnected", whatsapp: await getWhatsappAutomationStatus(access) };
  }
  const state = await readEvolutionState(connection.phoneNumberId);
  if (state) await updateEvolutionConnectionState(access.organizationId, connection.phoneNumberId, state);
  return { state: state || connection.status, whatsapp: await getWhatsappAutomationStatus(access) };
}

export async function beginEvolutionPairing(access: AccessContext, phoneValue: string) {
  requireOwner(access);
  const phone = normalizeWhatsappPhone(phoneValue);
  if (!phone || phone.length < 12 || phone.length > 15) throw new Error("Informe o WhatsApp com DDD. Exemplo: (41) 99999-9999.");

  const db = await getDb();
  const allConnections = await db.select().from(whatsappConnections);
  const occupied = allConnections.find((item) =>
    item.organizationId !== access.organizationId &&
    item.provider === "evolution" &&
    normalizeWhatsappPhone(item.displayPhoneNumber) === phone,
  );
  if (occupied) throw new Error("Este WhatsApp já está conectado a outra barbearia no Cortou Anotou.");

  const name = instanceName(access.organizationId);
  let created: Record<string, unknown> | null = null;
  const existing = await findEvolutionInstance(name);
  if (!existing) created = await createEvolutionInstance(name, phone);

  const stateBefore = await readEvolutionState(name);
  if (stateBefore === "open" || stateBefore === "connected") {
    const now = new Date().toISOString();
    await db.insert(whatsappConnections).values({
      organizationId: access.organizationId,
      provider: "evolution",
      status: "connected",
      onboardingMode: "linked_device",
      wabaId: "",
      phoneNumberId: name,
      displayPhoneNumber: phone,
      verifiedName: "WhatsApp conectado",
      encryptedAccessToken: "",
      accessTokenIv: "",
      webhookSubscribedAt: now,
      registeredAt: now,
      connectedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: whatsappConnections.organizationId,
      set: { provider:"evolution", status:"connected", onboardingMode:"linked_device", wabaId:"", phoneNumberId:name, displayPhoneNumber:phone, verifiedName:"WhatsApp conectado", encryptedAccessToken:"", accessTokenIv:"", webhookSubscribedAt:now, registeredAt:now, connectedAt:now, updatedAt:now },
    });
    return { pairingCode: "", state: "open", whatsapp: await getWhatsappAutomationStatus(access) };
  }

  let connectResult = created ?? {};
  let pairingCode = pairingCodeFrom(connectResult);
  if (!pairingCode) {
    for (let attempt = 0; attempt < 3 && !pairingCode; attempt += 1) {
      connectResult = await connectEvolutionInstance(name, phone);
      pairingCode = pairingCodeFrom(connectResult);
      if (!pairingCode && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  if (!pairingCode) throw new Error("O WhatsApp não gerou o código de conexão. Tente novamente em alguns segundos.");

  const now = new Date().toISOString();
  await db.insert(whatsappConnections).values({
    organizationId: access.organizationId,
    provider: "evolution",
    status: "connecting",
    onboardingMode: "linked_device",
    wabaId: "",
    phoneNumberId: name,
    displayPhoneNumber: phone,
    verifiedName: "WhatsApp",
    encryptedAccessToken: "",
    accessTokenIv: "",
    webhookSubscribedAt: now,
    registeredAt: now,
    connectedAt: null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: whatsappConnections.organizationId,
    set: { provider:"evolution", status:"connecting", onboardingMode:"linked_device", wabaId:"", phoneNumberId:name, displayPhoneNumber:phone, verifiedName:"WhatsApp", encryptedAccessToken:"", accessTokenIv:"", webhookSubscribedAt:now, registeredAt:now, connectedAt:null, updatedAt:now },
  });

  return { pairingCode, state: "connecting", whatsapp: await getWhatsappAutomationStatus(access) };
}

export async function disconnectEvolutionWhatsapp(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  const connection = (await db.select().from(whatsappConnections).where(eq(whatsappConnections.organizationId, access.organizationId)).limit(1))[0];
  if (connection?.provider === "evolution" && connection.phoneNumberId) {
    try {
      await evolutionRequest(`/instance/logout/${encodeURIComponent(connection.phoneNumberId)}`, { method: "DELETE" });
    } catch (error) {
      console.error("Evolution logout failed", { type: error instanceof Error ? error.name : "Unknown" });
    }
  }
  const now = new Date().toISOString();
  await db.update(whatsappConnections).set({ status:"disconnected", connectedAt:null, updatedAt:now }).where(eq(whatsappConnections.organizationId, access.organizationId));
  await db.update(whatsappAutomationSettings).set({ enabled:false, updatedAt:now }).where(eq(whatsappAutomationSettings.organizationId, access.organizationId));
}

function evolutionText(kind: string, payload: Record<string, string>) {
  if (kind === "bot_text") return String(payload.text ?? "").trim().slice(0, 3500);
  const client = String(payload.clientName ?? "cliente").trim();
  const business = String(payload.organizationName ?? "barbearia").trim();
  const date = String(payload.date ?? "").trim();
  const time = String(payload.time ?? "").trim();
  const service = String(payload.serviceName ?? "").trim();
  const barber = String(payload.barberName ?? "").trim();
  if (kind === "confirmation") return `Olá, ${client}! Seu horário na ${business} está confirmado para ${date} às ${time}. Serviço: ${service}. Profissional: ${barber}.`;
  if (kind === "reminder") return `Olá, ${client}! Lembrete do seu horário na ${business}: ${date} às ${time}. Serviço: ${service}. Profissional: ${barber}.`;
  if (kind === "cancellation") return `Olá, ${client}. Seu horário na ${business} de ${date} às ${time}, para ${service}, foi cancelado.`;
  if (kind === "rescheduled") return `Olá, ${client}! Seu horário na ${business} foi remarcado para ${date} às ${time}. Serviço: ${service}. Profissional: ${barber}.`;
  return "";
}

async function sendEvolutionText(instance: string, phone: string, text: string) {
  if (!text) throw new Error("Mensagem vazia.");
  const body = await evolutionRequest<Record<string, unknown>>(`/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, text }),
  });
  const key = body.key && typeof body.key === "object" ? body.key as Record<string, unknown> : {};
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
  const dataKey = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
  const providerMessageId = String(key.id ?? dataKey.id ?? body.messageId ?? body.id ?? "").trim();
  if (!providerMessageId) throw new Error("A Evolution enviou a mensagem, mas não devolveu o identificador dela.");
  return providerMessageId;
}

export async function processEvolutionWhatsappQueue(options: { organizationId?: number; limit?: number } = {}) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(50, Math.round(Number(options.limit ?? 20))));
  const now = new Date().toISOString();
  const statusCondition = or(
    eq(whatsappMessages.status, "queued"),
    and(eq(whatsappMessages.status, "failed"), eq(whatsappMessages.errorText, META_FALLTHROUGH_ERROR)),
  );
  const condition = options.organizationId
    ? and(eq(whatsappMessages.organizationId, options.organizationId), statusCondition, lte(whatsappMessages.scheduledAt, now))
    : and(statusCondition, lte(whatsappMessages.scheduledAt, now));
  const queue = await db.select().from(whatsappMessages).where(condition).orderBy(whatsappMessages.scheduledAt, whatsappMessages.id).limit(limit);
  let sent = 0;
  let failed = 0;

  for (const message of queue) {
    const connection = (await db.select().from(whatsappConnections).where(eq(whatsappConnections.organizationId, message.organizationId)).limit(1))[0];
    if (!connection || connection.provider !== "evolution" || connection.status !== "connected" || !connection.phoneNumberId) continue;
    const settings = (await db.select().from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, message.organizationId)).limit(1))[0];
    if (!settings?.enabled || Number(settings.monthlyMessageLimit) <= 0) continue;

    const claimedAt = new Date().toISOString();
    const claimed = await db.update(whatsappMessages).set({ status:"sending", errorText:"", updatedAt:claimedAt }).where(and(
      eq(whatsappMessages.id, message.id),
      or(eq(whatsappMessages.status, "queued"), eq(whatsappMessages.status, "failed")),
    )).returning({ id:whatsappMessages.id });
    if (!claimed[0]?.id) continue;

    try {
      const payload = JSON.parse(message.payloadJson || "{}") as Record<string, string>;
      const text = evolutionText(message.kind, payload);
      const providerMessageId = await sendEvolutionText(connection.phoneNumberId, message.phone, text);
      const sentAt = new Date().toISOString();
      await db.update(whatsappMessages).set({ providerMessageId, status:"sent", sentAt, failedAt:null, errorText:"", updatedAt:sentAt }).where(eq(whatsappMessages.id, message.id));
      await db.insert(whatsappConversations).values({ organizationId:message.organizationId, phone:message.phone, lastOutboundAt:sentAt, updatedAt:sentAt }).onConflictDoUpdate({
        target:[whatsappConversations.organizationId, whatsappConversations.phone],
        set:{ lastOutboundAt:sentAt, updatedAt:sentAt },
      });
      sent += 1;
    } catch (error) {
      const failedAt = new Date().toISOString();
      await db.update(whatsappMessages).set({ status:"failed", failedAt, errorText:error instanceof Error ? error.message.slice(0,500) : "Falha ao enviar pela Evolution.", updatedAt:failedAt }).where(eq(whatsappMessages.id, message.id));
      failed += 1;
    }
  }
  return { processed:queue.length, sent, failed };
}

function evolutionTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString();
  const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds).toISOString();
}

function inboundText(data: Record<string, unknown>) {
  const message = data.message && typeof data.message === "object" ? data.message as Record<string, unknown> : {};
  if (typeof message.conversation === "string") return message.conversation.trim();
  const extended = message.extendedTextMessage && typeof message.extendedTextMessage === "object" ? message.extendedTextMessage as Record<string, unknown> : {};
  if (typeof extended.text === "string") return extended.text.trim();
  const image = message.imageMessage && typeof message.imageMessage === "object" ? message.imageMessage as Record<string, unknown> : {};
  if (typeof image.caption === "string") return image.caption.trim();
  return "";
}

export type EvolutionWebhookResult = { received:number; statuses:number; inboundTextEvents:WhatsappInboundTextEvent[] };

export async function handleEvolutionWebhook(payload: unknown): Promise<EvolutionWebhookResult> {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const event = String(body.event ?? "").toLowerCase().replaceAll("_", ".");
  const name = String(body.instance ?? body.instanceName ?? "").trim();
  if (!name) return { received:0, statuses:0, inboundTextEvents:[] };
  const db = await getDb();
  const connection = (await db.select().from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "evolution"),
    eq(whatsappConnections.phoneNumberId, name),
  )).limit(1))[0];
  if (!connection) return { received:0, statuses:0, inboundTextEvents:[] };

  const rawData = body.data;
  const data = rawData && typeof rawData === "object" && !Array.isArray(rawData) ? rawData as Record<string, unknown> : {};
  if (event === "connection.update" || event === "connection.update") {
    const state = String(data.state ?? data.status ?? "").toLowerCase();
    if (state) await updateEvolutionConnectionState(connection.organizationId, name, state);
    return { received:0, statuses:1, inboundTextEvents:[] };
  }
  if (event !== "messages.upsert") return { received:0, statuses:0, inboundTextEvents:[] };

  const key = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
  if (Boolean(key.fromMe)) return { received:0, statuses:0, inboundTextEvents:[] };
  const remoteJid = String(key.remoteJid ?? data.remoteJid ?? "");
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("broadcast")) return { received:0, statuses:0, inboundTextEvents:[] };
  const barePhone = remoteJid.split("@")[0].split(":")[0];
  const phone = normalizeWhatsappPhone(barePhone);
  const providerMessageId = String(key.id ?? data.id ?? "").trim();
  const text = inboundText(data).slice(0, 3500);
  if (!phone || !providerMessageId) return { received:0, statuses:0, inboundTextEvents:[] };
  const receivedAt = evolutionTimestamp(data.messageTimestamp ?? body.date_time ?? body.dateTime);
  const inserted = await db.insert(whatsappMessages).values({
    organizationId:connection.organizationId,
    appointmentId:null,
    direction:"inbound",
    kind:text ? "inbound_text" : `inbound_${String(data.messageType ?? "unknown")}`,
    phone,
    dedupeKey:`inbound:${providerMessageId}`,
    providerMessageId,
    status:"received",
    scheduledAt:receivedAt,
    sentAt:receivedAt,
    payloadJson:JSON.stringify(data),
    updatedAt:receivedAt,
  }).onConflictDoNothing().returning({ id:whatsappMessages.id });
  if (!inserted[0]?.id) return { received:0, statuses:0, inboundTextEvents:[] };
  const preview = text.slice(0,240);
  await db.insert(whatsappConversations).values({ organizationId:connection.organizationId, phone, lastInboundAt:receivedAt, lastInboundPreview:preview, updatedAt:receivedAt }).onConflictDoUpdate({
    target:[whatsappConversations.organizationId, whatsappConversations.phone],
    set:{ lastInboundAt:receivedAt, lastInboundPreview:preview, updatedAt:receivedAt },
  });
  const inboundTextEvents: WhatsappInboundTextEvent[] = text ? [{ organizationId:connection.organizationId, messageRowId:inserted[0].id, providerMessageId, phone, text, receivedAt }] : [];
  return { received:1, statuses:0, inboundTextEvents };
}

export function validEvolutionWebhookAuthorization(value: string) {
  const expected = requiredEvolutionEnvironment().webhookSecret;
  const actual = value.startsWith("Bearer ") ? value.slice(7) : value;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
