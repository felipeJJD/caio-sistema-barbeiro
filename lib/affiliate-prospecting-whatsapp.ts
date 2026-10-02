const INSTANCE_NAME = "ca-prospeccao-outbound";
const MIN_SEND_INTERVAL_MS = 12_000;

let sendGate: Promise<void> = Promise.resolve();
let lastSendAt = 0;

type EvolutionPayload = Record<string, unknown> & {
  error?: string;
  message?: string | string[];
  response?: { message?: string | string[] };
};

class EvolutionHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function evolutionConfig() {
  const url = String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.EVOLUTION_API_KEY ?? "").trim();
  if (!/^https:\/\//.test(url) || apiKey.length < 24) {
    const error = new Error("O envio automático da prospecção ainda não está configurado.");
    Object.assign(error, { status: 503 });
    throw error;
  }
  return { url, apiKey };
}

function cleanPhone(value: string) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(4);
  if (digits.startsWith("55") && digits.length === 13) return digits;
  if (digits.length === 11) return `55${digits}`;
  return "";
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
    const raw = body.response?.message ?? body.message ?? body.error ?? `Evolution respondeu HTTP ${response.status}`;
    const detail = Array.isArray(raw) ? raw.join(" · ") : String(raw);
    throw new EvolutionHttpError(detail.slice(0, 500), response.status);
  }
  return body;
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
    return { state, connected: state === "open" || state === "connected", instance: INSTANCE_NAME };
  } catch (error) {
    if (error instanceof EvolutionHttpError && error.status === 404) return { state: "disconnected", connected: false, instance: INSTANCE_NAME };
    throw error;
  }
}

export async function beginProspectingWhatsappPairing(phoneValue: string) {
  const phone = cleanPhone(phoneValue);
  if (!/^55\d{11}$/.test(phone)) {
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
      }),
    });
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
  return { state: "connecting", connected: false, instance: INSTANCE_NAME, pairingCode };
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
  const phone = cleanPhone(phoneValue);
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
