import { affiliateProspectingFetch } from "./affiliate-prospecting-bridge";

const PROSPECTING_INSTANCE = "ca-prospeccao-outbound";

type ObjectLike = Record<string, unknown>;

function objectOf(value: unknown): ObjectLike {
  return value && typeof value === "object" ? value as ObjectLike : {};
}

function eventName(value: unknown) {
  return String(value ?? "").toLowerCase().replaceAll("_", ".");
}

function phoneFromJid(value: unknown) {
  let digits = String(value ?? "").split("@")[0].replace(/\D/g, "");
  if (/^55\d{11}$/.test(digits)) return digits;
  if (/^55\d{10}$/.test(digits)) {
    digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
    if (/^55\d{11}$/.test(digits)) return digits;
  }
  return "";
}

function inboundPhone(data: ObjectLike) {
  const key = objectOf(data.key);
  for (const candidate of [key.remoteJidAlt, key.remoteJid]) {
    const phone = phoneFromJid(candidate);
    if (phone) return phone;
  }
  return "";
}

function inboundText(data: ObjectLike) {
  const message = objectOf(data.message);
  const direct = String(message.conversation ?? "").trim();
  if (direct) return direct.slice(0, 2000);

  const extended = objectOf(message.extendedTextMessage);
  const extendedText = String(extended.text ?? "").trim();
  if (extendedText) return extendedText.slice(0, 2000);

  for (const key of ["imageMessage", "videoMessage", "documentMessage"]) {
    const media = objectOf(message[key]);
    const caption = String(media.caption ?? "").trim();
    if (caption) return caption.slice(0, 2000);
  }

  const buttons = objectOf(message.buttonsResponseMessage);
  const selected = String(buttons.selectedDisplayText ?? buttons.selectedButtonId ?? "").trim();
  if (selected) return selected.slice(0, 2000);

  const list = objectOf(message.listResponseMessage);
  const listTitle = String(list.title ?? "").trim();
  if (listTitle) return listTitle.slice(0, 2000);

  const type = String(data.messageType ?? "").toLowerCase();
  if (type.includes("audio")) return "Áudio recebido";
  if (type.includes("image")) return "Imagem recebida";
  if (type.includes("video")) return "Vídeo recebido";
  if (type.includes("document")) return "Documento recebido";
  return "Mensagem recebida";
}

export async function captureProspectingEvolutionInbound(payload: unknown) {
  const body = objectOf(payload);
  const instance = String(body.instance ?? body.instanceName ?? "").trim();
  if (instance !== PROSPECTING_INSTANCE) return { handled: false, recorded: false };

  if (eventName(body.event) !== "messages.upsert") {
    return { handled: true, recorded: false };
  }

  const data = objectOf(body.data);
  const key = objectOf(data.key);
  if (Boolean(key.fromMe)) return { handled: true, recorded: false };

  const phoneE164 = inboundPhone(data);
  if (!phoneE164) return { handled: true, recorded: false };

  const providerMessageId = String(key.id ?? data.id ?? "").trim().slice(0, 240);
  const message = inboundText(data);
  const { response, payload: result } = await affiliateProspectingFetch("/api/claims", {
    method: "POST",
    body: { action: "inbound", phoneE164, message, providerMessageId },
  });
  if (!response.ok) {
    const error = result && typeof result === "object" ? String((result as { error?: unknown }).error ?? "") : "";
    throw new Error(error || "Não foi possível registrar a resposta da prospecção.");
  }
  const record = result && typeof result === "object" ? result as { matched?: boolean; duplicate?: boolean } : {};
  return { handled: true, recorded: Boolean(record.matched), duplicate: Boolean(record.duplicate), phoneE164 };
}
