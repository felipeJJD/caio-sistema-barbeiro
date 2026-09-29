import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { whatsappAutomationSettings, whatsappConnections, whatsappConversations, whatsappMessages } from "./schema";
import { getWhatsappEntitlementForOrganization } from "./whatsapp-entitlement";
import { prepareEvolutionAudio } from "../lib/evolution-audio-format";
import { normalizeWhatsappPhone } from "../lib/whatsapp";
import type { WhatsappInboundTextEvent } from "./whatsapp";

type AudioResult =
  | { kind:"transcribed"; event:WhatsappInboundTextEvent }
  | { kind:"failed"; organizationId:number; phone:string; providerMessageId:string }
  | { kind:"ignored" };

type EvolutionAudioEnvelope = {
  instanceName: string;
  organizationId: number;
  phone: string;
  providerMessageId: string;
  senderName: string;
  receivedAt: string;
  data: Record<string, unknown>;
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedEvolutionEvent(payload: unknown) {
  const body = objectValue(payload);
  return String(body.event ?? "").toLowerCase().replaceAll("_", ".");
}

function messageFromData(data: Record<string, unknown>) {
  return objectValue(data.message);
}

export function isEvolutionAudioWebhook(payload: unknown) {
  const body = objectValue(payload);
  if (normalizedEvolutionEvent(payload) !== "messages.upsert") return false;
  const data = objectValue(body.data);
  const key = objectValue(data.key);
  if (Boolean(key.fromMe)) return false;
  const message = messageFromData(data);
  return Boolean(message.audioMessage) || String(data.messageType ?? "").toLowerCase().includes("audio");
}

function evolutionTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString();
  return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
}

async function parseAudioEnvelope(payload: unknown): Promise<EvolutionAudioEnvelope | null> {
  if (!isEvolutionAudioWebhook(payload)) return null;
  const body = objectValue(payload);
  const data = objectValue(body.data);
  const key = objectValue(data.key);
  const instanceName = String(body.instance ?? body.instanceName ?? "").trim();
  const providerMessageId = String(key.id ?? data.id ?? "").trim();
  if (!instanceName || !providerMessageId) return null;

  const remoteJid = String(key.remoteJid ?? data.remoteJid ?? "");
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("broadcast")) return null;
  const phoneJid = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@c.us")
    ? remoteJid
    : String(key.remoteJidAlt ?? data.remoteJidAlt ?? "");
  if (!phoneJid.endsWith("@s.whatsapp.net") && !phoneJid.endsWith("@c.us")) return null;
  const phone = normalizeWhatsappPhone(phoneJid.split("@")[0].split(":")[0]);
  if (!phone) return null;

  const db = await getDb();
  const connection = (await db.select({ organizationId:whatsappConnections.organizationId, status:whatsappConnections.status }).from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "evolution"),
    eq(whatsappConnections.phoneNumberId, instanceName),
  )).limit(1))[0];
  if (!connection || connection.status !== "connected") return null;

  return {
    instanceName,
    organizationId:connection.organizationId,
    phone,
    providerMessageId,
    senderName:String(data.pushName ?? data.notifyName ?? "").trim().slice(0,120),
    receivedAt:evolutionTimestamp(data.messageTimestamp ?? body.date_time ?? body.dateTime),
    data,
  };
}

function cleanBase64(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const comma = raw.indexOf(",");
  return raw.startsWith("data:") && comma >= 0 ? raw.slice(comma + 1) : raw;
}

function audioMimeType(data: Record<string, unknown>, fallback = "audio/ogg") {
  const audio = objectValue(messageFromData(data).audioMessage);
  return String(audio.mimetype ?? audio.mime_type ?? fallback).trim() || fallback;
}

async function mediaJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12_000_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    return objectValue(JSON.parse(new TextDecoder().decode(bytes)));
  } finally {
    reader.releaseLock();
  }
}

async function evolutionMedia(instanceName: string, data: Record<string, unknown>) {
  const url = String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.EVOLUTION_API_KEY ?? "").trim();
  if (!/^https:\/\//.test(url) || apiKey.length < 24) return null;

  const embedded = cleanBase64(messageFromData(data).base64);
  if (embedded) return { base64:embedded, mimeType:audioMimeType(data) };

  try {
    const response = await fetch(`${url}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
      method:"POST",
      headers:{ apikey:apiKey, "content-type":"application/json" },
      body:JSON.stringify({ message:data }),
      cache:"no-store",
      signal:AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.warn("evolution_audio_media_unavailable", { status:response.status });
      return null;
    }
    // Refuse oversized media before JSON parsing and base64 allocation.
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 12_000_000) return null;
    const payload = await mediaJson(response);
    if (!payload) return null;
    const nested = objectValue(payload.data);
    const base64 = cleanBase64(payload.base64) || cleanBase64(nested.base64);
    if (!base64) return null;
    const mimeType = String(payload.mimetype ?? payload.mimeType ?? nested.mimetype ?? nested.mimeType ?? audioMimeType(data)).trim() || audioMimeType(data);
    return { base64, mimeType };
  } catch (error) {
    console.warn("evolution_audio_media_unavailable", { type:error instanceof Error ? error.name : "Unknown" });
    return null;
  }
}

async function transcribeAudio(base64: string, mimeType: string) {
  const key = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) return "";
  const prepared = await prepareEvolutionAudio(base64, mimeType);
  if (!prepared) return "";
  const audio = new Blob([new Uint8Array(prepared.bytes)], { type:prepared.mimeType });
  const outbound = new FormData();
  outbound.append("file", audio, `whatsapp.${prepared.extension}`);
  outbound.append("model", String(process.env.OPENAI_TRANSCRIBE_MODEL ?? "").trim() || "gpt-4o-mini-transcribe");
  // Keep the hint neutral: listing services here can bias a short or noisy
  // voice note into words the customer never said.
  outbound.append("prompt", "Conversa em português brasileiro. Preserve somente as palavras realmente faladas, inclusive gírias e nomes próprios.");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method:"POST",
      headers:{ Authorization:`Bearer ${key}` },
      body:outbound,
      signal:AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn("ca_atende_audio_transcription_unavailable", { status:response.status });
      return "";
    }
    const payload = await response.json().catch(() => ({})) as { text?: string };
    return String(payload.text ?? "").trim().slice(0,3500);
  } catch (error) {
    console.warn("ca_atende_audio_transcription_unavailable", { type:error instanceof Error ? error.name : "Unknown" });
    return "";
  }
}

export async function transcribeEvolutionAudioWebhook(payload: unknown): Promise<AudioResult> {
  const envelope = await parseAudioEnvelope(payload);
  if (!envelope) return { kind:"ignored" };
  const db = await getDb();
  const row = (await db.select({ id:whatsappMessages.id, kind:whatsappMessages.kind, phone:whatsappMessages.phone }).from(whatsappMessages).where(and(
    eq(whatsappMessages.organizationId, envelope.organizationId),
    eq(whatsappMessages.providerMessageId, envelope.providerMessageId),
    eq(whatsappMessages.direction, "inbound"),
  )).limit(1))[0];
  if (!row || row.phone !== envelope.phone || !row.kind.startsWith("inbound_") || row.kind === "inbound_text" || row.kind === "inbound_audio_processing" || row.kind === "inbound_audio_transcribed" || row.kind === "inbound_audio_failed") return { kind:"ignored" };

  const [settings, conversation, entitlement] = await Promise.all([
    db.select({ enabled:whatsappAutomationSettings.enabled, botEnabled:whatsappAutomationSettings.botEnabled }).from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, envelope.organizationId)).limit(1),
    db.select({ pauseReason:whatsappConversations.pauseReason, automationPausedUntil:whatsappConversations.automationPausedUntil }).from(whatsappConversations).where(and(eq(whatsappConversations.organizationId, envelope.organizationId), eq(whatsappConversations.phone, envelope.phone))).limit(1),
    getWhatsappEntitlementForOrganization(envelope.organizationId),
  ]);
  const paused = conversation[0]?.pauseReason === "human_takeover" && !conversation[0].automationPausedUntil
    || Boolean(conversation[0]?.automationPausedUntil && conversation[0].automationPausedUntil > new Date().toISOString());
  if (!settings[0]?.enabled || !settings[0].botEnabled || !entitlement.hasAccess || paused) return { kind:"ignored" };

  const claimed = await db.update(whatsappMessages).set({ kind:"inbound_audio_processing", updatedAt:new Date().toISOString() }).where(and(
    eq(whatsappMessages.id, row.id), eq(whatsappMessages.kind, row.kind),
  )).returning({ id:whatsappMessages.id });
  if (!claimed[0]) return { kind:"ignored" };

  let text = "";
  try {
    const media = await evolutionMedia(envelope.instanceName, envelope.data);
    text = media ? await transcribeAudio(media.base64, media.mimeType) : "";
  } catch (error) {
    console.warn("ca_atende_audio_processing_unavailable", { type:error instanceof Error ? error.name : "Unknown" });
  }
  if (!text) {
    await db.update(whatsappMessages).set({ kind:"inbound_audio_failed", updatedAt:new Date().toISOString() }).where(eq(whatsappMessages.id, row.id));
    return { kind:"failed", organizationId:envelope.organizationId, phone:envelope.phone, providerMessageId:envelope.providerMessageId };
  }

  const updatedAt = new Date().toISOString();
  await db.update(whatsappMessages).set({
    kind:"inbound_audio_transcribed",
    payloadJson:JSON.stringify({ ...envelope.data, caTranscription:text }),
    updatedAt,
  }).where(eq(whatsappMessages.id, row.id));
  await db.insert(whatsappConversations).values({
    organizationId:envelope.organizationId,
    phone:envelope.phone,
    lastInboundAt:envelope.receivedAt,
    lastInboundPreview:`Áudio: ${text}`.slice(0,240),
    updatedAt,
  }).onConflictDoUpdate({
    target:[whatsappConversations.organizationId, whatsappConversations.phone],
    set:{ lastInboundAt:envelope.receivedAt, lastInboundPreview:`Áudio: ${text}`.slice(0,240), updatedAt },
  });

  return { kind:"transcribed", event:{
    organizationId:envelope.organizationId,
    messageRowId:row.id,
    providerMessageId:envelope.providerMessageId,
    phone:envelope.phone,
    senderName:envelope.senderName || undefined,
    text,
    receivedAt:envelope.receivedAt,
  } };
}
