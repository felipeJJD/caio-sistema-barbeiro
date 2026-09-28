import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import {
  whatsappAutomationSettings,
  whatsappConnections,
  whatsappConversations,
  whatsappMessages,
} from "./schema";
import { handleWhatsappWebhook, getWhatsappAutomationStatus } from "./whatsapp";

const EVOLUTION_PROVIDER = "evolution";
const EVOLUTION_MODE = "evolution_qr";
const IMMEDIATE_META_FAILURE = "A conexão do WhatsApp desta barbearia não está ativa.";

function evolutionEnvironment() {
  return {
    baseUrl: String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/+$/, ""),
    apiKey: String(process.env.EVOLUTION_API_KEY ?? "").trim(),
    webhookSecret: String(process.env.EVOLUTION_WEBHOOK_SECRET ?? "").trim(),
  };
}

export function getEvolutionClientConfig() {
  const config = evolutionEnvironment();
  const missing: string[] = [];
  if (!/^https?:\/\//i.test(config.baseUrl)) missing.push("EVOLUTION_API_URL");
  if (config.apiKey.length < 16) missing.push("EVOLUTION_API_KEY");
  if (config.webhookSecret.length < 24) missing.push("EVOLUTION_WEBHOOK_SECRET");
  return {
    ready: missing.length === 0,
    missing,
    provider: EVOLUTION_PROVIDER,
    qrCode: true,
  };
}

function requiredEvolutionEnvironment() {
  const config = evolutionEnvironment();
  const publicConfig = getEvolutionClientConfig();
  if (!publicConfig.ready) {
    throw new Error(`A Evolution API ainda não foi configurada: ${publicConfig.missing.join(", ")}.`);
  }
  return config;
}

function instanceNameForOrganization(organizationId: number) {
  return `cortou-anotou-${organizationId}`;
}

async function evolutionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = requiredEvolutionEnvironment();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.apiKey,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & {
    message?: string | string[];
    error?: string;
    response?: { message?: string | string[] };
  };
  if (!response.ok) {
    const raw = body.response?.message ?? body.message ?? body.error ?? `Evolution respondeu HTTP ${response.status}`;
    const details = Array.isArray(raw) ? raw.join(" · ") : String(raw);
    throw new Error(details.slice(0, 500));
  }
  return body;
}

async function connectionForOrganization(organizationId: number) {
  const db = await getDb();
  return (await db.select().from(whatsappConnections)
    .where(eq(whatsappConnections.organizationId, organizationId)).limit(1))[0] ?? null;
}

async function ensureEvolutionWebhook(instanceName: string, origin: string) {
  const config = requiredEvolutionEnvironment();
  const webhookUrl = `${origin.replace(/\/+$/, "")}/api/whatsapp/webhook`;
  await evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        headers: { "x-ca-evolution-secret": config.webhookSecret },
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      },
    }),
  });
}

function readQr(payload: unknown) {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const nested = (root.qrcode && typeof root.qrcode === "object" ? root.qrcode : {}) as Record<string, unknown>;
  const base64 = String(nested.base64 ?? root.base64 ?? "");
  const code = String(nested.code ?? root.code ?? "");
  const pairingCode = String(nested.pairingCode ?? root.pairingCode ?? "");
  return { base64, code, pairingCode };
}

function normalizeQrBase64(value: string) {
  if (!value) return "";
  return value.startsWith("data:image/") ? value : `data:image/png;base64,${value}`;
}

function stateFromPayload(payload: unknown) {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const instance = (root.instance && typeof root.instance === "object" ? root.instance : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : {}) as Record<string, unknown>;
  return String(root.state ?? root.status ?? instance.state ?? instance.status ?? data.state ?? data.status ?? "").toLowerCase();
}

function isOpenState(state: string) {
  return state === "open" || state === "connected" || state === "ready";
}

async function updateConnectionState(organizationId: number, state: string, details?: { displayPhoneNumber?: string; verifiedName?: string }) {
  const db = await getDb();
  const now = new Date().toISOString();
  const connected = isOpenState(state);
  await db.update(whatsappConnections).set({
    status: connected ? "connected" : "connecting",
    displayPhoneNumber: details?.displayPhoneNumber ?? sql`${whatsappConnections.displayPhoneNumber}`,
    verifiedName: details?.verifiedName ?? sql`${whatsappConnections.verifiedName}`,
    connectedAt: connected ? now : sql`${whatsappConnections.connectedAt}`,
    updatedAt: now,
  }).where(eq(whatsappConnections.organizationId, organizationId));
}

async function fetchEvolutionInstance(instanceName: string) {
  const result = await evolutionRequest<unknown>(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
  const root = result as unknown;
  const first = Array.isArray(root) ? root[0] : root;
  const item = (first && typeof first === "object" ? first : {}) as Record<string, unknown>;
  const ownerJid = String(item.ownerJid ?? item.owner ?? item.number ?? "");
  const displayPhoneNumber = ownerJid.replace(/@.*/, "").replace(/\D/g, "").slice(0, 20);
  const verifiedName = String(item.profileName ?? item.name ?? "").slice(0, 120);
  return { item, displayPhoneNumber, verifiedName, state: stateFromPayload(item) };
}

export async function refreshEvolutionConnection(access: AccessContext, origin?: string) {
  requireOwner(access);
  const current = await connectionForOrganization(access.organizationId);
  if (!current || current.provider !== EVOLUTION_PROVIDER || !current.phoneNumberId) {
    return getWhatsappAutomationStatus(access);
  }

  try {
    const statePayload = await evolutionRequest<unknown>(`/instance/connectionState/${encodeURIComponent(current.phoneNumberId)}`);
    const state = stateFromPayload(statePayload);
    let details: { displayPhoneNumber?: string; verifiedName?: string } = {};
    if (isOpenState(state)) {
      try {
        const found = await fetchEvolutionInstance(current.phoneNumberId);
        details = { displayPhoneNumber: found.displayPhoneNumber, verifiedName: found.verifiedName };
      } catch {
        // State is authoritative; profile metadata is optional.
      }
      if (origin) {
        try { await ensureEvolutionWebhook(current.phoneNumberId, origin); } catch (error) { console.error("Evolution webhook refresh failed", error); }
      }
    }
    await updateConnectionState(access.organizationId, state, details);
  } catch (error) {
    console.error("Evolution connection refresh failed", error);
  }

  return getWhatsappAutomationStatus(access);
}

export async function startEvolutionConnection(access: AccessContext, origin: string) {
  requireOwner(access);
  requiredEvolutionEnvironment();
  const db = await getDb();
  const current = await connectionForOrganization(access.organizationId);
  if (current?.provider === "meta_cloud" && current.status === "connected") {
    throw new Error("Desconecte a integração da Meta antes de conectar este número pela Evolution.");
  }

  const instanceName = current?.provider === EVOLUTION_PROVIDER && current.phoneNumberId
    ? current.phoneNumberId
    : instanceNameForOrganization(access.organizationId);

  let instanceId = current?.provider === EVOLUTION_PROVIDER ? current.wabaId : "";
  let qr = { base64: "", code: "", pairingCode: "" };

  let exists = false;
  try {
    const found = await fetchEvolutionInstance(instanceName);
    exists = Boolean(Object.keys(found.item).length);
    instanceId = String(found.item.id ?? found.item.instanceId ?? instanceId ?? "");
    if (isOpenState(found.state)) {
      await db.insert(whatsappConnections).values({
        organizationId: access.organizationId,
        provider: EVOLUTION_PROVIDER,
        status: "connected",
        onboardingMode: EVOLUTION_MODE,
        wabaId: instanceId,
        phoneNumberId: instanceName,
        displayPhoneNumber: found.displayPhoneNumber,
        verifiedName: found.verifiedName,
        encryptedAccessToken: "",
        accessTokenIv: "",
        encryptedRegistrationPin: "",
        registrationPinIv: "",
        webhookSubscribedAt: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        connectedAt: current?.connectedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: whatsappConnections.organizationId,
        set: {
          provider: EVOLUTION_PROVIDER,
          status: "connected",
          onboardingMode: EVOLUTION_MODE,
          wabaId: instanceId,
          phoneNumberId: instanceName,
          displayPhoneNumber: found.displayPhoneNumber,
          verifiedName: found.verifiedName,
          encryptedAccessToken: "",
          accessTokenIv: "",
          tokenExpiresAt: null,
          encryptedRegistrationPin: "",
          registrationPinIv: "",
          webhookSubscribedAt: new Date().toISOString(),
          registeredAt: new Date().toISOString(),
          connectedAt: current?.connectedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await ensureEvolutionWebhook(instanceName, origin);
      return { whatsapp: await getWhatsappAutomationStatus(access), qr: null };
    }
  } catch {
    exists = false;
  }

  if (!exists) {
    const created = await evolutionRequest<Record<string, unknown>>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        rejectCall: true,
        msgCall: "Não atendemos chamadas por WhatsApp. Envie uma mensagem.",
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
    });
    const instance = (created.instance && typeof created.instance === "object" ? created.instance : {}) as Record<string, unknown>;
    instanceId = String(instance.instanceId ?? instance.id ?? created.instanceId ?? "");
    qr = readQr(created);
  }

  await ensureEvolutionWebhook(instanceName, origin);

  if (!qr.base64 && !qr.code) {
    const connectPayload = await evolutionRequest<unknown>(`/instance/connect/${encodeURIComponent(instanceName)}`);
    qr = readQr(connectPayload);
  }

  const now = new Date().toISOString();
  await db.insert(whatsappConnections).values({
    organizationId: access.organizationId,
    provider: EVOLUTION_PROVIDER,
    status: "connecting",
    onboardingMode: EVOLUTION_MODE,
    wabaId: instanceId,
    phoneNumberId: instanceName,
    displayPhoneNumber: "",
    verifiedName: "",
    encryptedAccessToken: "",
    accessTokenIv: "",
    tokenExpiresAt: null,
    encryptedRegistrationPin: "",
    registrationPinIv: "",
    webhookSubscribedAt: now,
    registeredAt: now,
    connectedAt: null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: whatsappConnections.organizationId,
    set: {
      provider: EVOLUTION_PROVIDER,
      status: "connecting",
      onboardingMode: EVOLUTION_MODE,
      wabaId: instanceId,
      phoneNumberId: instanceName,
      displayPhoneNumber: "",
      verifiedName: "",
      encryptedAccessToken: "",
      accessTokenIv: "",
      tokenExpiresAt: null,
      encryptedRegistrationPin: "",
      registrationPinIv: "",
      webhookSubscribedAt: now,
      registeredAt: now,
      connectedAt: null,
      updatedAt: now,
    },
  });

  return {
    whatsapp: await getWhatsappAutomationStatus(access),
    qr: qr.base64 || qr.code || qr.pairingCode ? {
      base64: normalizeQrBase64(qr.base64),
      code: qr.code,
      pairingCode: qr.pairingCode,
    } : null,
  };
}

export async function disconnectEvolutionWhatsapp(access: AccessContext) {
  requireOwner(access);
  const current = await connectionForOrganization(access.organizationId);
  if (!current || current.provider !== EVOLUTION_PROVIDER || !current.phoneNumberId) return false;
  try {
    await evolutionRequest(`/instance/logout/${encodeURIComponent(current.phoneNumberId)}`, { method: "DELETE" });
  } catch (error) {
    console.error("Evolution logout failed", error);
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.update(whatsappConnections).set({
    status: "disconnected",
    displayPhoneNumber: "",
    verifiedName: "",
    connectedAt: null,
    updatedAt: now,
  }).where(eq(whatsappConnections.organizationId, access.organizationId));
  await db.update(whatsappAutomationSettings).set({ enabled: false, updatedAt: now })
    .where(eq(whatsappAutomationSettings.organizationId, access.organizationId));
  return true;
}

function formatDatePtBr(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function outboundText(message: typeof whatsappMessages.$inferSelect) {
  const payload = JSON.parse(message.payloadJson || "{}") as Record<string, string>;
  if (message.kind === "bot_text") return String(payload.text ?? "").trim().slice(0, 3500);
  const client = String(payload.clientName ?? "cliente").trim();
  const org = String(payload.organizationName ?? "barbearia").trim();
  const service = String(payload.serviceName ?? "serviço").trim();
  const barber = String(payload.barberName ?? "profissional").trim();
  const date = formatDatePtBr(String(payload.date ?? ""));
  const time = String(payload.time ?? "").trim();
  if (message.kind === "confirmation") return `Olá, ${client}! Seu horário na ${org} foi confirmado para ${date} às ${time}. Serviço: ${service}. Profissional: ${barber}.`;
  if (message.kind === "reminder") return `Olá, ${client}! Passando para lembrar do seu horário na ${org}: ${date} às ${time}. Serviço: ${service}. Profissional: ${barber}.`;
  if (message.kind === "cancellation") return `Olá, ${client}. Seu horário na ${org} de ${date} às ${time} foi cancelado. Se quiser, faça um novo agendamento pelo link da barbearia.`;
  if (message.kind === "rescheduled") return `Olá, ${client}! Seu horário na ${org} foi remarcado para ${date} às ${time}. Serviço: ${service}. Profissional: ${barber}.`;
  return "";
}

function providerMessageId(result: unknown) {
  const root = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const key = (root.key && typeof root.key === "object" ? root.key : {}) as Record<string, unknown>;
  const message = (root.message && typeof root.message === "object" ? root.message : {}) as Record<string, unknown>;
  const messageKey = (message.key && typeof message.key === "object" ? message.key : {}) as Record<string, unknown>;
  return String(key.id ?? messageKey.id ?? root.id ?? `evo-${crypto.randomUUID()}`);
}

async function evolutionSend(instanceName: string, phone: string, text: string) {
  if (!text) throw new Error("A mensagem ficou vazia.");
  const result = await evolutionRequest<unknown>(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, text, delay: 300, linkPreview: false }),
  });
  return providerMessageId(result);
}

async function sentCountThisMonth(organizationId: number) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const db = await getDb();
  const row = (await db.select({ count: sql<number>`count(*)` }).from(whatsappMessages).where(and(
    eq(whatsappMessages.organizationId, organizationId),
    eq(whatsappMessages.direction, "outbound"),
    gte(whatsappMessages.sentAt, monthStart),
    or(eq(whatsappMessages.status, "sent"), eq(whatsappMessages.status, "delivered"), eq(whatsappMessages.status, "read")),
  )).limit(1))[0];
  return Number(row?.count ?? 0);
}

export async function processEvolutionWhatsappQueue(options: { organizationId?: number; limit?: number } = {}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const limit = Math.max(1, Math.min(50, Math.round(Number(options.limit ?? 20))));
  const conditions = [
    eq(whatsappConnections.provider, EVOLUTION_PROVIDER),
    eq(whatsappConnections.status, "connected"),
    lte(whatsappMessages.scheduledAt, now),
    or(
      eq(whatsappMessages.status, "queued"),
      and(eq(whatsappMessages.status, "failed"), eq(whatsappMessages.errorText, IMMEDIATE_META_FAILURE)),
    ),
  ];
  if (options.organizationId) conditions.push(eq(whatsappMessages.organizationId, options.organizationId));

  const queue = await db.select({ message: whatsappMessages, instanceName: whatsappConnections.phoneNumberId })
    .from(whatsappMessages)
    .innerJoin(whatsappConnections, eq(whatsappConnections.organizationId, whatsappMessages.organizationId))
    .where(and(...conditions))
    .orderBy(whatsappMessages.scheduledAt, whatsappMessages.id)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of queue) {
    const message = row.message;
    const claimedAt = new Date().toISOString();
    const claimed = await db.update(whatsappMessages).set({ status: "sending", updatedAt: claimedAt })
      .where(and(eq(whatsappMessages.id, message.id), or(eq(whatsappMessages.status, "queued"), eq(whatsappMessages.status, "failed"))))
      .returning({ id: whatsappMessages.id });
    if (!claimed[0]?.id) continue;
    try {
      const settings = (await db.select().from(whatsappAutomationSettings)
        .where(eq(whatsappAutomationSettings.organizationId, message.organizationId)).limit(1))[0];
      if (!settings?.enabled) throw new Error("As automações do WhatsApp estão desligadas.");
      if (Number(settings.monthlyMessageLimit) <= 0) throw new Error("Esta barbearia não possui pacote de mensagens ativo.");
      if (await sentCountThisMonth(message.organizationId) >= Number(settings.monthlyMessageLimit)) throw new Error("O limite mensal de mensagens desta barbearia foi atingido.");

      const id = await evolutionSend(row.instanceName, message.phone, outboundText(message));
      const sentAt = new Date().toISOString();
      await db.update(whatsappMessages).set({ providerMessageId: id, status: "sent", sentAt, failedAt: null, errorText: "", updatedAt: sentAt })
        .where(eq(whatsappMessages.id, message.id));
      await db.insert(whatsappConversations).values({ organizationId: message.organizationId, phone: message.phone, lastOutboundAt: sentAt, updatedAt: sentAt })
        .onConflictDoUpdate({ target: [whatsappConversations.organizationId, whatsappConversations.phone], set: { lastOutboundAt: sentAt, updatedAt: sentAt } });
      sent += 1;
    } catch (error) {
      const failedAt = new Date().toISOString();
      await db.update(whatsappMessages).set({
        status: "failed",
        failedAt,
        errorText: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida ao enviar pela Evolution.",
        updatedAt: failedAt,
      }).where(eq(whatsappMessages.id, message.id));
      failed += 1;
    }
  }
  return { processed: queue.length, sent, failed };
}

export async function processEvolutionWhatsappQueueSafely(organizationId?: number, limit = 5) {
  try { return await processEvolutionWhatsappQueue({ organizationId, limit }); }
  catch (error) {
    console.error("Evolution WhatsApp queue failed", error);
    return { processed: 0, sent: 0, failed: 0 };
  }
}

function textFromEvolutionMessage(message: Record<string, unknown>) {
  const conversation = String(message.conversation ?? "");
  if (conversation) return conversation;
  const extended = (message.extendedTextMessage && typeof message.extendedTextMessage === "object" ? message.extendedTextMessage : {}) as Record<string, unknown>;
  if (extended.text) return String(extended.text);
  const image = (message.imageMessage && typeof message.imageMessage === "object" ? message.imageMessage : {}) as Record<string, unknown>;
  if (image.caption) return String(image.caption);
  const video = (message.videoMessage && typeof message.videoMessage === "object" ? message.videoMessage : {}) as Record<string, unknown>;
  if (video.caption) return String(video.caption);
  const button = (message.buttonsResponseMessage && typeof message.buttonsResponseMessage === "object" ? message.buttonsResponseMessage : {}) as Record<string, unknown>;
  if (button.selectedDisplayText || button.selectedButtonId) return String(button.selectedDisplayText ?? button.selectedButtonId);
  const list = (message.listResponseMessage && typeof message.listResponseMessage === "object" ? message.listResponseMessage : {}) as Record<string, unknown>;
  const single = (list.singleSelectReply && typeof list.singleSelectReply === "object" ? list.singleSelectReply : {}) as Record<string, unknown>;
  return String(list.title ?? single.selectedRowId ?? "");
}

function evolutionTimestamp(value: unknown) {
  if (typeof value === "number") return String(Math.floor(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  const object = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const low = Number(object.low ?? 0);
  return low > 0 ? String(low) : String(Math.floor(Date.now() / 1000));
}

export async function handleEvolutionWebhook(payload: unknown) {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const event = String(root.event ?? "").toLowerCase().replace(/_/g, ".");
  const instanceName = String(root.instance ?? root.instanceName ?? "");
  const data = root.data;
  if (!instanceName) return { received: 0, statuses: 0, inboundTextEvents: [] as Awaited<ReturnType<typeof handleWhatsappWebhook>>["inboundTextEvents"] };

  const db = await getDb();
  const connection = (await db.select().from(whatsappConnections)
    .where(and(eq(whatsappConnections.provider, EVOLUTION_PROVIDER), eq(whatsappConnections.phoneNumberId, instanceName))).limit(1))[0];
  if (!connection) return { received: 0, statuses: 0, inboundTextEvents: [] as Awaited<ReturnType<typeof handleWhatsappWebhook>>["inboundTextEvents"] };

  if (event.includes("connection.update")) {
    const state = stateFromPayload(data);
    const now = new Date().toISOString();
    await db.update(whatsappConnections).set({
      status: isOpenState(state) ? "connected" : state === "close" || state === "closed" ? "disconnected" : "connecting",
      connectedAt: isOpenState(state) ? (connection.connectedAt ?? now) : connection.connectedAt,
      updatedAt: now,
    }).where(eq(whatsappConnections.organizationId, connection.organizationId));
    return { received: 0, statuses: 0, inboundTextEvents: [] as Awaited<ReturnType<typeof handleWhatsappWebhook>>["inboundTextEvents"] };
  }

  if (!event.includes("messages.upsert")) return { received: 0, statuses: 0, inboundTextEvents: [] as Awaited<ReturnType<typeof handleWhatsappWebhook>>["inboundTextEvents"] };
  const items = Array.isArray(data) ? data : [data];
  const messages: Array<{ id: string; from: string; timestamp: string; type: string; text?: { body?: string } }> = [];
  for (const itemValue of items) {
    const item = (itemValue && typeof itemValue === "object" ? itemValue : {}) as Record<string, unknown>;
    const key = (item.key && typeof item.key === "object" ? item.key : {}) as Record<string, unknown>;
    if (Boolean(key.fromMe)) continue;
    const jid = String(key.remoteJid ?? item.remoteJid ?? "");
    if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) continue;
    const phone = jid.replace(/@.*/, "").replace(/\D/g, "");
    const providerId = String(key.id ?? item.id ?? "");
    if (!phone || !providerId) continue;
    const message = (item.message && typeof item.message === "object" ? item.message : {}) as Record<string, unknown>;
    const text = textFromEvolutionMessage(message).trim();
    messages.push({
      id: providerId,
      from: phone,
      timestamp: evolutionTimestamp(item.messageTimestamp ?? item.timestamp),
      type: text ? "text" : String(item.messageType ?? "unknown"),
      ...(text ? { text: { body: text } } : {}),
    });
  }
  if (!messages.length) return { received: 0, statuses: 0, inboundTextEvents: [] as Awaited<ReturnType<typeof handleWhatsappWebhook>>["inboundTextEvents"] };
  return handleWhatsappWebhook({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: instanceName }, messages } }] }],
  });
}

export function validEvolutionWebhookSecret(value: string) {
  const expected = evolutionEnvironment().webhookSecret;
  if (!expected || value.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ value.charCodeAt(index);
  return difference === 0;
}
