import { randomUUID } from "node:crypto";
import { and, desc, eq, lte } from "drizzle-orm";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { whatsappConnections, whatsappMessages } from "./schema";
import { getWhatsappEntitlementForOrganization } from "./whatsapp-entitlement";

const STATUS_KIND = "status_text";
const STATUS_PHONE = "status@broadcast";
const STATUS_QUEUED = "status_queued";
const STATUS_SENDING = "status_sending";
const STATUS_SENT = "status_sent";
const STATUS_FAILED = "status_failed";
const STATUS_CANCELLED = "status_cancelled";
const MAX_STATUS_TEXT = 500;
const MAX_FUTURE_MS = 30 * 24 * 60 * 60_000;

type StatusPayload = {
  text?: string;
  allContacts?: boolean;
  backgroundColor?: string;
  font?: number;
};

function readStatusPayload(value: string): StatusPayload {
  try {
    const parsed = JSON.parse(value || "{}") as StatusPayload;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function publicStatus(value: string) {
  if (value === STATUS_QUEUED) return "queued" as const;
  if (value === STATUS_SENDING) return "sending" as const;
  if (value === STATUS_SENT) return "sent" as const;
  if (value === STATUS_CANCELLED) return "cancelled" as const;
  return "failed" as const;
}

async function connectionForOrganization(organizationId: number) {
  const db = await getDb();
  return (await db.select().from(whatsappConnections).where(eq(whatsappConnections.organizationId, organizationId)).limit(1))[0];
}

async function assertStatusAvailable(organizationId: number) {
  const connection = await connectionForOrganization(organizationId);
  if (!connection || connection.provider !== "evolution" || connection.status !== "connected" || !connection.phoneNumberId) {
    throw new Error("Conecte o WhatsApp pela Evolution antes de publicar Status.");
  }
  const entitlement = await getWhatsappEntitlementForOrganization(organizationId);
  if (!entitlement.hasAccess) throw new Error("Renove o acesso ao WhatsApp antes de publicar Status.");
  return connection;
}

export async function getWhatsappStatusPublicationState(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  const connection = await connectionForOrganization(access.organizationId);
  const entitlement = await getWhatsappEntitlementForOrganization(access.organizationId);
  const connected = Boolean(connection && connection.provider === "evolution" && connection.status === "connected" && connection.phoneNumberId);
  const rows = await db.select().from(whatsappMessages).where(and(
    eq(whatsappMessages.organizationId, access.organizationId),
    eq(whatsappMessages.kind, STATUS_KIND),
  )).orderBy(desc(whatsappMessages.id)).limit(20);

  return {
    connectionStatus: connected ? "connected" : "disconnected",
    canPublish: connected && entitlement.hasAccess,
    reason: !connected ? "Conecte o WhatsApp primeiro." : !entitlement.hasAccess ? "Renove a assinatura para usar publicações de Status." : "",
    publications: rows.map((row) => {
      const payload = readStatusPayload(row.payloadJson);
      return {
        id: row.id,
        text: String(payload.text ?? ""),
        status: publicStatus(row.status),
        scheduledAt: row.scheduledAt,
        sentAt: row.sentAt,
        failedAt: row.failedAt,
        errorText: row.errorText,
        createdAt: row.createdAt,
      };
    }),
  };
}

export async function createWhatsappStatusPublication(access: AccessContext, input: { text: string; scheduledAt?: string; publishNow?: boolean }) {
  requireOwner(access);
  await assertStatusAvailable(access.organizationId);
  const text = String(input.text ?? "").trim();
  if (!text) throw new Error("Escreva o texto do Status.");
  if (text.length > MAX_STATUS_TEXT) throw new Error(`O texto pode ter no máximo ${MAX_STATUS_TEXT} caracteres nesta versão de teste.`);

  const nowMs = Date.now();
  const scheduled = input.publishNow ? new Date(nowMs) : new Date(String(input.scheduledAt ?? ""));
  if (!Number.isFinite(scheduled.getTime())) throw new Error("Escolha uma data e um horário válidos.");
  if (!input.publishNow && scheduled.getTime() < nowMs - 60_000) throw new Error("Escolha um horário atual ou futuro.");
  if (scheduled.getTime() > nowMs + MAX_FUTURE_MS) throw new Error("Nesta versão de teste, programe no máximo 30 dias à frente.");

  const db = await getDb();
  const now = new Date().toISOString();
  const inserted = await db.insert(whatsappMessages).values({
    organizationId: access.organizationId,
    appointmentId: null,
    direction: "outbound",
    kind: STATUS_KIND,
    phone: STATUS_PHONE,
    templateName: "",
    dedupeKey: `status:${access.organizationId}:${randomUUID()}`,
    status: STATUS_QUEUED,
    scheduledAt: scheduled.toISOString(),
    payloadJson: JSON.stringify({ text, allContacts: true, backgroundColor: "#0b3b2e", font: 1 }),
    createdAt: now,
    updatedAt: now,
  }).returning({ id: whatsappMessages.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error("Não foi possível criar a publicação.");
  return id;
}

export async function cancelWhatsappStatusPublication(access: AccessContext, idValue: number) {
  requireOwner(access);
  const id = Math.round(Number(idValue));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Publicação inválida.");
  const db = await getDb();
  const now = new Date().toISOString();
  const cancelled = await db.update(whatsappMessages).set({
    status: STATUS_CANCELLED,
    errorText: "Cancelado pelo proprietário.",
    updatedAt: now,
  }).where(and(
    eq(whatsappMessages.id, id),
    eq(whatsappMessages.organizationId, access.organizationId),
    eq(whatsappMessages.kind, STATUS_KIND),
    eq(whatsappMessages.status, STATUS_QUEUED),
  )).returning({ id: whatsappMessages.id });
  if (!cancelled[0]?.id) throw new Error("Esta publicação não está mais disponível para cancelamento.");
}

function evolutionConfig() {
  return {
    url: String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/$/, ""),
    apiKey: String(process.env.EVOLUTION_API_KEY ?? "").trim(),
  };
}

function evolutionError(raw: string, status: number) {
  try {
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    const response = body.response && typeof body.response === "object" ? body.response as Record<string, unknown> : {};
    const value = response.message ?? body.message ?? body.error;
    if (Array.isArray(value)) return value.map(String).join(" · ").slice(0, 500);
    if (value) return String(value).slice(0, 500);
  } catch {
    // Resposta não JSON: usa a mensagem padrão abaixo.
  }
  return `Evolution respondeu HTTP ${status}`;
}

async function sendEvolutionStatusText(instance: string, text: string) {
  const config = evolutionConfig();
  if (!/^https:\/\//.test(config.url) || config.apiKey.length < 24) throw new Error("A Evolution ainda não está pronta para publicar Status.");
  const response = await fetch(`${config.url}/message/sendStatus/${encodeURIComponent(instance)}`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { apikey: config.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      type: "text",
      content: text,
      allContacts: true,
      backgroundColor: "#0b3b2e",
      font: 1,
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(evolutionError(raw, response.status));
}

export async function processWhatsappStatusQueue(options: { organizationId?: number; messageId?: number; limit?: number } = {}) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(20, Math.round(Number(options.limit ?? 10))));
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();

  await db.update(whatsappMessages).set({
    status: STATUS_FAILED,
    failedAt: now,
    errorText: "Envio interrompido ou sem confirmação. Confira o Status no WhatsApp antes de tentar novamente.",
    updatedAt: now,
  }).where(and(
    eq(whatsappMessages.kind, STATUS_KIND),
    eq(whatsappMessages.status, STATUS_SENDING),
    lte(whatsappMessages.updatedAt, staleBefore),
    options.organizationId ? eq(whatsappMessages.organizationId, options.organizationId) : undefined,
  ));

  const queue = await db.select().from(whatsappMessages).where(and(
    eq(whatsappMessages.kind, STATUS_KIND),
    eq(whatsappMessages.status, STATUS_QUEUED),
    lte(whatsappMessages.scheduledAt, now),
    options.organizationId ? eq(whatsappMessages.organizationId, options.organizationId) : undefined,
    options.messageId ? eq(whatsappMessages.id, options.messageId) : undefined,
  )).orderBy(whatsappMessages.scheduledAt, whatsappMessages.id).limit(limit);

  let sent = 0;
  let failed = 0;
  for (const message of queue) {
    const claimedAt = new Date().toISOString();
    const claimed = await db.update(whatsappMessages).set({ status: STATUS_SENDING, errorText: "", updatedAt: claimedAt }).where(and(
      eq(whatsappMessages.id, message.id),
      eq(whatsappMessages.status, STATUS_QUEUED),
    )).returning({ id: whatsappMessages.id });
    if (!claimed[0]?.id) continue;

    try {
      const connection = await assertStatusAvailable(message.organizationId);
      const payload = readStatusPayload(message.payloadJson);
      const text = String(payload.text ?? "").trim();
      if (!text) throw new Error("O texto desta publicação está vazio.");
      await sendEvolutionStatusText(connection.phoneNumberId, text);
      const sentAt = new Date().toISOString();
      await db.update(whatsappMessages).set({
        status: STATUS_SENT,
        sentAt,
        failedAt: null,
        errorText: "",
        updatedAt: sentAt,
      }).where(and(eq(whatsappMessages.id, message.id), eq(whatsappMessages.status, STATUS_SENDING)));
      sent += 1;
    } catch (error) {
      const failedAt = new Date().toISOString();
      const uncertain = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      const errorText = uncertain
        ? "A Evolution não confirmou o envio. Confira o Status no WhatsApp antes de tentar novamente."
        : error instanceof Error ? error.message.slice(0, 500) : "Falha ao publicar o Status.";
      await db.update(whatsappMessages).set({
        status: STATUS_FAILED,
        failedAt,
        errorText,
        updatedAt: failedAt,
      }).where(and(eq(whatsappMessages.id, message.id), eq(whatsappMessages.status, STATUS_SENDING)));
      failed += 1;
    }
  }
  return { processed: queue.length, sent, failed };
}
