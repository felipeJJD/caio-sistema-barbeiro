import { isProspectingInstance } from "./affiliate-prospecting-whatsapp";
import { affiliateProspectingFetch } from "./affiliate-prospecting-bridge";



type ObjectLike = Record<string, unknown>;

function objectOf(value: unknown): ObjectLike {
  return value && typeof value === "object" ? value as ObjectLike : {};
}

function eventName(value: unknown) {
  return String(value ?? "").toLowerCase().replaceAll("_", ".");
}

function phoneFromJid(value: unknown) {
  const jid = String(value ?? "");
  if (!/^\d+@(s\.whatsapp\.net|c\.us)$/.test(jid)) return "";
  let digits = jid.split("@")[0];
  if (/^55\d{11}$/.test(digits)) return digits;
  if (/^55\d{10}$/.test(digits)) {
    digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
    if (/^55\d{11}$/.test(digits)) return digits;
  }
  return "";
}

function inboundPhone(data: ObjectLike) {
  const key = objectOf(data.key);
  if (String(key.remoteJid || "").endsWith("@g.us")) return "";
  for (const candidate of [key.remoteJidAlt, key.remoteJid]) {
    const phone = phoneFromJid(candidate);
    if (phone) return phone;
  }
  return "";
}

function inboundText(data: ObjectLike) {
  let message = objectOf(data.message);
  for (let depth = 0; depth < 3; depth++) {
    const wrapped = objectOf(message.ephemeralMessage ?? message.viewOnceMessage ?? message.viewOnceMessageV2);
    if (!wrapped.message) break;
    message = objectOf(wrapped.message);
  }
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
  if (!isProspectingInstance(instance)) return { handled: false, recorded: false };
  const event = eventName(body.event);
  if (event !== "messages.upsert" && event !== "messages.update") return { handled: true, recorded: false };
  const entries = Array.isArray(body.data) ? body.data : [body.data];
  let recorded = false;
  for (const entry of entries) {
    const data = objectOf(entry); const key = objectOf(data.key);
    const providerMessageId = String(key.id ?? data.id ?? "").trim().slice(0, 240);
    if (!providerMessageId) continue;
    if (event === "messages.update") {
      const update = objectOf(data.update);
      const status = String(data.status ?? update.status ?? "").toUpperCase();
      const delivery = ["3","DELIVERY_ACK"].includes(status) ? "delivered" : ["4","5","READ","PLAYED"].includes(status) ? "read" : "";
      if (!delivery) continue;
      const result = await affiliateProspectingFetch("/api/queue", { method:"POST",body:{action:"delivery",instance,providerMessageId,delivery} });
      if (!result.response.ok) throw new Error("Não foi possível registrar o status da prospecção.");
      continue;
    }
    const phoneE164 = inboundPhone(data); if (!phoneE164) continue;
    const message = inboundText(data);
    const outgoing = key.fromMe === true;
    const { response, payload: result } = await affiliateProspectingFetch(outgoing ? "/api/queue" : "/api/claims", {
      method: "POST", body: { action: outgoing ? "outbound" : "inbound", instance, phoneE164, message, providerMessageId },
    });
    if (!response.ok) throw new Error("Não foi possível registrar a resposta da prospecção.");
    const record = objectOf(result); recorded = recorded || Boolean(record.matched);
  }
  return { handled: true, recorded, duplicate: false };
}
