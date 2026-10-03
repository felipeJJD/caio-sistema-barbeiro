const INSTANCE_NAME = "ca-prospeccao-outbound";
const MIN_SEND_INTERVAL_MS = 12_000;
const WEBHOOK_REFRESH_MS = 5 * 60_000;
const WEBHOOK_URL = "https://cortouanotou.com.br/api/whatsapp/evolution/webhook";
const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"] as const;

let sendGate: Promise<void> = Promise.resolve();
let lastSendAt = 0;
let webhookConfiguredAt = 0;
let webhookSetup: Promise<void> | null = null;

type EvolutionPayload = Record<string, unknown> & {
  error?: unknown;
  message?: unknown;
  response?: { message?: unknown };
};

class EvolutionHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function evolutionConfig() {
  const url = String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.EVOLUTION_API_KEY ?? "").trim();
  const webhookSecret = String(process.env.EVOLUTION_WEBHOOK_SECRET ?? "").trim();
  if (!/^https:\/\//.test(url) || apiKey.length < 24) {
    const error = new Error("O envio automático da prospecção ainda não está configurado.");
    Object.assign(error, { status: 503 });
    throw error;
  }
  return { url, apiKey, webhookSecret };
}

function requiredWebhookSecret() {
  const { webhookSecret } = evolutionConfig();
  if (webhookSecret.length < 24) {
    const error = new Error("O recebimento das respostas da prospecção ainda não está configurado.");
    Object.assign(error, { status: 503 });
    throw error;
  }
  return webhookSecret;
}

function prospectingWebhook(secret: string) {
  return {
    enabled: true,
    url: WEBHOOK_URL,
    headers: {
      authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    byEvents: false,
    base64: false,
    events: [...WEBHOOK_EVENTS],
  };
}

export function normalizeProspectingWhatsappPhone(value: string) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(4);

  // No pareamento, respeita exatamente o número que o próprio WhatsApp/Evolution
  // reconhece. Alguns JIDs brasileiros antigos ainda aparecem sem o nono dígito.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

function evolutionErrorDetail(value: unknown, status: number) {
  const fallback = status === 400
    ? "O WhatsApp recusou esse número. Ele pode não estar cadastrado no WhatsApp ou pode estar em um formato diferente."
    : `Evolution respondeu HTTP ${status}`;

  function read(item: unknown, depth = 0): string {
    if (depth > 3 || item == null) return "";
    if (typeof item === "string") return item.trim();
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (Array.isArray(item)) return item.map((entry) => read(entry, depth + 1)).filter(Boolean).join(" · ");
    if (typeof item === "object") {
      const record = item as Record<string, unknown>;
      for (const key of ["message", "error", "detail", "cause", "description"]) {
        const nested = read(record[key], depth + 1);
        if (nested) return nested;
      }
      try {
        const json = JSON.stringify(item);
        if (json && json !== "{}") return json;
      } catch {
        return "";
      }
    }
    return "";
  }

  const text = read(value).replace(/\[object Object\]/g, "").trim();
  return (text || fallback).slice(0, 500);
}

async function evolutionRequest<T extends EvolutionPayload>(path: string, init: RequestInit = {}) {
  const config = evolutionConfig();
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      apikey: config.apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T;
  if (!response.ok) {
    const raw = body.response?.message ?? body.message ?? body.error;
    throw new EvolutionHttpError(evolutionErrorDetail(raw, response.status), response.status);
  }
  return body;
}

async function ensureProspectingWebhook(force = false) {
  if (!force && webhookConfiguredAt && Date.now() - webhookConfiguredAt < WEBHOOK_REFRESH_MS) return;
  if (webhookSetup) return webhookSetup;

  webhookSetup = (async () => {
    const secret = requiredWebhookSecret();
    await evolutionRequest<EvolutionPayload>(`/webhook/set/${encodeURIComponent(INSTANCE_NAME)}`, {
      method: "POST",
      body: JSON.stringify({ webhook: prospectingWebhook(secret) }),
    });
    webhookConfiguredAt = Date.now();
  })().finally(() => {
    webhookSetup = null;
  });

  return webhookSetup;
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

async function fetchInstance() {
  const result = await evolutionRequest<EvolutionPayload>(`/instance/fetchInstances?instanceName=${encodeURIComponent(INSTANCE_NAME)}`);
  if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined;
  const data = result.data;
  return Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
}

export async function getProspectingWhatsappState() {
  try {
    const body = await evolutionRequest<EvolutionPayload>(`/instance/connectionState/${encodeURIComponent(INSTANCE_NAME)}`);
    const nested = body.instance && typeof body.instance === "object" ? body.instance as Record<string, unknown> : {};
    const state = String(nested.state ?? body.state ?? "disconnected").toLowerCase();
    const connected = state === "open" || state === "connected";
    if (connected) await ensureProspectingWebhook();
    return { state, connected, instance: INSTANCE_NAME };
  } catch (error) {
    if (error instanceof EvolutionHttpError && error.status === 404) return { state: "disconnected", connected: false, instance: INSTANCE_NAME };
    throw error;
  }
}

export async function beginProspectingWhatsappPairing(phoneValue: string) {
  const phone = normalizeProspectingWhatsappPhone(phoneValue);
  if (!/^55\d{10,11}$/.test(phone)) {
    const error = new Error("Informe o número de prospecção com DDD. Exemplo: (41) 99999-9999.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  const state = await getProspectingWhatsappState();
  if (state.connected) return { ...state, pairingCode: "" };

  let result: EvolutionPayload = {};
  const existing = await fetchInstance().catch((error) => {
    if (error instanceof EvolutionHttpError && error.status === 404) return undefined;
    throw error;
  });

  if (!existing) {
    const secret = requiredWebhookSecret();
    result = await evolutionRequest<EvolutionPayload>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: INSTANCE_NAME,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        number: phone,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
        webhook: prospectingWebhook(secret),
      }),
    });
    webhookConfiguredAt = Date.now();
  } else {
    await ensureProspectingWebhook(true);
  }

  let pairingCode = pairingCodeFrom(result);
  for (let attempt = 0; attempt < 3 && !pairingCode; attempt += 1) {
    const connect = await evolutionRequest<EvolutionPayload>(`/instance/connect/${encodeURIComponent(INSTANCE_NAME)}?number=${encodeURIComponent(phone)}`);
    pairingCode = pairingCodeFrom(connect);
    if (!pairingCode && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  if (!pairingCode) {
    const error = new Error("O WhatsApp não gerou o código de conexão. Tente novamente em alguns segundos.");
    Object.assign(error, { status: 503 });
    throw error;
  }
  return { state: "connecting", connected: false, instance: INSTANCE_NAME, pairingCode, phone };
}

async function waitForSendSlot() {
  let release = () => {};
  const previous = sendGate;
  sendGate = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const waitMs = Math.max(0, MIN_SEND_INTERVAL_MS - (Date.now() - lastSendAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  return release;
}

export async function sendProspectingWhatsappText(phoneValue: string, textValue: string) {
  const phone = normalizeProspectingWhatsappPhone(phoneValue);
  const text = String(textValue ?? "").trim().slice(0, 1200);
  if (!/^55\d{11}$/.test(phone)) {
    const error = new Error("Celular inválido para envio automático.");
    Object.assign(error, { status: 400 });
    throw error;
  }
  if (!text) {
    const error = new Error("A mensagem está vazia.");
    Object.assign(error, { status: 400 });
    throw error;
  }
  const state = await getProspectingWhatsappState();
  if (!state.connected) {
    const error = new Error("Conecte o número de prospecção antes de enviar automaticamente.");
    Object.assign(error, { status: 409 });
    throw error;
  }

  const release = await waitForSendSlot();
  try {
    const body = await evolutionRequest<EvolutionPayload>(`/message/sendText/${encodeURIComponent(INSTANCE_NAME)}`, {
      method: "POST",
      body: JSON.stringify({ number: phone, text, delay: 1200, linkPreview: true }),
    });
    const key = body.key && typeof body.key === "object" ? body.key as Record<string, unknown> : {};
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const dataKey = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
    const providerMessageId = String(key.id ?? dataKey.id ?? body.messageId ?? body.id ?? "").trim();
    if (!providerMessageId) throw new Error("A mensagem foi aceita, mas a Evolution não devolveu o identificador dela.");
    lastSendAt = Date.now();
    return { providerMessageId, phone };
  } finally {
    release();
  }
}
