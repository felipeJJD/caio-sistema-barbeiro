import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { whatsappConnections } from "./schema";
import { normalizeWhatsappPhone } from "../lib/whatsapp";
import { getWhatsappAutomationStatus } from "./whatsapp";

const EVOLUTION_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"] as const;

function evolutionEnvironment() {
  return {
    url: String(process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/$/, ""),
    apiKey: String(process.env.EVOLUTION_API_KEY ?? "").trim(),
    webhookSecret: String(process.env.EVOLUTION_WEBHOOK_SECRET ?? "").trim(),
  };
}

function requiredEvolutionEnvironment() {
  const config = evolutionEnvironment();
  if (!/^https:\/\//.test(config.url) || config.apiKey.length < 24 || config.webhookSecret.length < 24) {
    throw new Error("A conexão rápida do WhatsApp ainda está sendo preparada.");
  }
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
    signal: AbortSignal.timeout(15_000),
    headers: {
      apikey: config.apiKey,
      ...(init.body ? { "content-type":"application/json" } : {}),
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

function resultArray(value: unknown) {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.data)) return object.data as Record<string, unknown>[];
  if (Array.isArray(object.instances)) return object.instances as Record<string, unknown>[];
  return [];
}

function instanceRecordName(value: Record<string, unknown>) {
  const nested = value.instance && typeof value.instance === "object"
    ? value.instance as Record<string, unknown>
    : {};
  return String(value.name ?? value.instanceName ?? nested.name ?? "").trim();
}

async function findEvolutionInstance(name: string) {
  const result = await evolutionRequest<unknown>("/instance/fetchInstances");
  return resultArray(result).find((item) => instanceRecordName(item) === name);
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
    method:"POST",
    body:JSON.stringify({
      instanceName:name,
      integration:"WHATSAPP-BAILEYS",
      qrcode:true,
      number:phone,
      groupsIgnore:true,
      alwaysOnline:false,
      readMessages:false,
      readStatus:false,
      syncFullHistory:false,
      webhook:{
        url:webhookUrl(),
        byEvents:false,
        base64:false,
        headers:{
          authorization:`Bearer ${config.webhookSecret}`,
          "Content-Type":"application/json",
        },
        events:[...EVOLUTION_EVENTS],
      },
    }),
  });
}

async function connectEvolutionInstance(name: string, phone?: string) {
  const suffix = phone ? `?number=${encodeURIComponent(phone)}` : "";
  return evolutionRequest<Record<string, unknown>>(`/instance/connect/${encodeURIComponent(name)}${suffix}`);
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

async function persistConnection(access: AccessContext, phone: string, name: string, status: "connecting" | "connected") {
  const db = await getDb();
  const now = new Date().toISOString();
  const connected = status === "connected";
  await db.insert(whatsappConnections).values({
    organizationId:access.organizationId,
    provider:"evolution",
    status,
    onboardingMode:"linked_device",
    wabaId:"",
    phoneNumberId:name,
    displayPhoneNumber:phone,
    verifiedName:connected ? "WhatsApp conectado" : "WhatsApp",
    encryptedAccessToken:"",
    accessTokenIv:"",
    webhookSubscribedAt:now,
    registeredAt:now,
    connectedAt:connected ? now : null,
    updatedAt:now,
  }).onConflictDoUpdate({
    target:whatsappConnections.organizationId,
    set:{
      provider:"evolution",
      status,
      onboardingMode:"linked_device",
      wabaId:"",
      phoneNumberId:name,
      displayPhoneNumber:phone,
      verifiedName:connected ? "WhatsApp conectado" : "WhatsApp",
      encryptedAccessToken:"",
      accessTokenIv:"",
      webhookSubscribedAt:now,
      registeredAt:now,
      connectedAt:connected ? now : null,
      updatedAt:now,
    },
  });
}

export async function beginEvolutionPairingSafe(access: AccessContext, phoneValue: string) {
  requireOwner(access);
  const phone = normalizeWhatsappPhone(phoneValue);
  if (!phone || phone.length < 12 || phone.length > 15) {
    throw new Error("Informe o WhatsApp com DDD. Exemplo: (41) 99999-9999.");
  }

  const db = await getDb();
  const current = (await db.select().from(whatsappConnections)).find((item) => item.organizationId === access.organizationId);
  if (current?.provider === "evolution" && current.status === "connected") {
    if (normalizeWhatsappPhone(current.displayPhoneNumber) !== phone) throw new Error("Já existe outro número conectado. Confira a conexão antes de trocar.");
    return { pairingCode:"", state:"open", whatsapp:await getWhatsappAutomationStatus(access) };
  }
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
    if (current?.provider === "evolution" && current.displayPhoneNumber && normalizeWhatsappPhone(current.displayPhoneNumber) !== phone) {
      throw new Error("Este aparelho já está vinculado a outro número. Confira o número conectado antes de continuar.");
    }
    await persistConnection(access, phone, name, "connected");
    return { pairingCode:"", state:"open", whatsapp:await getWhatsappAutomationStatus(access) };
  }

  let connectResult = created ?? {};
  let pairingCode = pairingCodeFrom(connectResult);

  if (!pairingCode) {
    for (let attempt = 0; attempt < 3 && !pairingCode; attempt += 1) {
      connectResult = await connectEvolutionInstance(name, phone);
      pairingCode = pairingCodeFrom(connectResult);
      if (!pairingCode && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }

  if (!pairingCode) {
    throw new Error("O código ainda não apareceu. Aguarde alguns segundos e toque em Gerar código novamente.");
  }

  await persistConnection(access, phone, name, "connecting");
  return { pairingCode, state:"connecting", whatsapp:await getWhatsappAutomationStatus(access) };
}
