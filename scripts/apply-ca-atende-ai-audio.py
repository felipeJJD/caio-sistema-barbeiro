from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrei {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# 1) AI interpreter receives the current conversation state too.
replace_once(
    "lib/ca-atende-model.ts",
    "  memory?: CaAtendeContextMemory;\n}): Promise<CaAtendeInterpretation | null> {",
    "  memory?: CaAtendeContextMemory;\n  state?: string;\n}): Promise<CaAtendeInterpretation | null> {",
)
replace_once(
    "lib/ca-atende-model.ts",
    "Contexto curto da conversa: ${JSON.stringify(input.memory || {})}.\n\nIntenções:",
    "Contexto curto da conversa: ${JSON.stringify(input.memory || {})}.\nEtapa atual do atendimento: ${String(input.state || \\"sem etapa\\").slice(0,80)}.\n\nIntenções:",
)
replace_once(
    "lib/ca-atende-model.ts",
    "Leve a memória em conta em respostas curtas. Se a conversa estava escolhendo agendamento/horário e a pessoa disser apenas \\\"Corte\\\", \\\"Eduardo\\\", \\\"amanhã\\\", \\\"9h\\\" ou \\\"quero resolver por aqui\\\", trate isso como continuação do agendamento, não como assunto novo.\n",
    "Leve a memória e a etapa atual em conta em respostas curtas. Entenda português informal do Brasil, abreviações, erros de digitação e transcrições de áudio com sotaque, sem inventar dados. Se a conversa estava escolhendo agendamento/horário e a pessoa disser apenas \\\"Corte\\\", \\\"Eduardo\\\", \\\"amanhã\\\", \\\"9h\\\" ou \\\"quero resolver por aqui\\\", trate isso como continuação do agendamento, não como assunto novo.\n",
)

# 2) Natural language becomes AI-first. Critical actions remain deterministic safeguards.
replace_once(
    "db/ca-atende.ts",
    "async function interpretationFor(message: string, context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory) {",
    "async function interpretationFor(message: string, context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory, state = \\\"\\\") {",
)

p = Path("db/ca-atende.ts")
text = p.read_text()
start_marker = "  // Clear requests and known entities are answered with organization data; AI\n"
end_marker = "\n}\n\ntype CaAtendeConversationSnapshot"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("db/ca-atende.ts: bloco interpretationFor não encontrado")
new_block = '''  const knownService = context.services.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const knownBarber = context.barbers.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const bookingContinuation = (memory.intent === "booking" || memory.intent === "availability")
    && (knownService || knownBarber || Boolean(extractCaAtendeDate(message)) || Boolean(extractCaAtendeTime(message)) || Boolean(extractCaAtendeTimeWindow(message).afterTime) || Boolean(extractCaAtendeTimeWindow(message).beforeTime) || wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message));

  // Ações críticas e pedido explícito de humano continuam determinísticos. Para
  // linguagem natural do cliente, a IA interpreta primeiro e as regras viram fallback.
  if (rule.intent === "spam" || rule.intent === "human" || rule.intent === "cancel" || rule.intent === "reschedule") return rule;

  let interpretation: CaAtendeInterpretation = rule;
  if (context.settings.aiFallbackEnabled) {
    const ai = await interpretCaAtendeWithAi({
      message,
      organizationName: context.organization.name,
      services: context.services.map(item => item.name),
      barbers: context.barbers.map(item => item.name),
      memory,
      state,
    });
    if (ai) {
      await recordAiUsageSafely({ organizationId:context.organization.id, surface:"ca_atende", usage:ai.aiUsage });
      interpretation = ai;
      if (ai.intent !== "unknown") return ai;
    }
  }

  if (rule.intent !== "unknown") return rule;
  if (bookingContinuation) return { ...rule, intent:memory.intent as "booking" | "availability" };
  if ([...context.services.map(item => item.name), ...context.barbers.map(item => item.name)]
    .some(name => normalized === normalizeCaAtendeText(name) || normalized === `quero o ${normalizeCaAtendeText(name)}`)) {
    return { ...rule, intent:memory.intent === "prices" ? "prices" as const : "booking" as const };
  }

  return interpretation;
'''
text = text[:start] + new_block + text[end:]
p.write_text(text)

replace_once(
    "db/ca-atende.ts",
    "  const interpreted = await interpretationFor(event.text, context, oldMemory);",
    "  const interpreted = await interpretationFor(event.text, context, oldMemory, stage);",
)
replace_once(
    "db/ca-atende.ts",
    "  if (stage === \\\"awaiting_reschedule_date\\\") {\n    const date = extractCaAtendeDate(event.text);",
    "  if (stage === \\\"awaiting_reschedule_date\\\") {\n    const stageInterpretation = await interpretationFor(event.text, context, oldMemory, stage);\n    const date = stageInterpretation.date || extractCaAtendeDate(event.text);",
)
replace_once(
    "db/ca-atende.ts",
    "  if (stage === \\\"awaiting_reschedule_time\\\") {\n    const time = extractCaAtendeTime(event.text);",
    "  if (stage === \\\"awaiting_reschedule_time\\\") {\n    const stageInterpretation = await interpretationFor(event.text, context, oldMemory, stage);\n    const time = stageInterpretation.time || extractCaAtendeTime(event.text);",
)

# 3) Audio notes: fetch/decode through Evolution and transcribe asynchronously with OpenAI.
evolution = Path("db/evolution-whatsapp.ts")
text = evolution.read_text()
inbound_func = '''function inboundText(data: Record<string, unknown>) {
  const message = data.message && typeof data.message === "object" ? data.message as Record<string, unknown> : {};
  if (typeof message.conversation === "string") return message.conversation.trim();
  const extended = message.extendedTextMessage && typeof message.extendedTextMessage === "object" ? message.extendedTextMessage as Record<string, unknown> : {};
  if (typeof extended.text === "string") return extended.text.trim();
  const image = message.imageMessage && typeof message.imageMessage === "object" ? message.imageMessage as Record<string, unknown> : {};
  if (typeof image.caption === "string") return image.caption.trim();
  return "";
}
'''
if text.count(inbound_func) != 1:
    raise SystemExit("db/evolution-whatsapp.ts: inboundText não encontrado")
helpers = inbound_func + r'''
function evolutionMessage(data: Record<string, unknown>) {
  return data.message && typeof data.message === "object" ? data.message as Record<string, unknown> : {};
}

function isEvolutionAudioMessage(data: Record<string, unknown>) {
  const message = evolutionMessage(data);
  return Boolean(message.audioMessage) || String(data.messageType ?? "").toLowerCase().includes("audio");
}

function cleanEvolutionBase64(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const comma = raw.indexOf(",");
  return raw.startsWith("data:") && comma >= 0 ? raw.slice(comma + 1) : raw;
}

function audioMimeType(data: Record<string, unknown>, fallback = "audio/ogg") {
  const message = evolutionMessage(data);
  const audio = message.audioMessage && typeof message.audioMessage === "object" ? message.audioMessage as Record<string, unknown> : {};
  return String(audio.mimetype ?? audio.mime_type ?? fallback).trim() || fallback;
}

function audioExtension(mimeType: string) {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  return "ogg";
}

async function evolutionAudioMedia(instance: string, data: Record<string, unknown>) {
  const message = evolutionMessage(data);
  const direct = cleanEvolutionBase64(message.base64);
  if (direct) return { base64:direct, mimeType:audioMimeType(data) };
  try {
    const result = await evolutionRequest<Record<string, unknown>>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method:"POST",
      body:JSON.stringify({ message:data }),
    });
    const base64 = cleanEvolutionBase64(result.base64);
    if (!base64) return null;
    return { base64, mimeType:String(result.mimetype ?? result.mimeType ?? audioMimeType(data)).trim() || audioMimeType(data) };
  } catch (error) {
    console.warn("evolution_audio_media_unavailable", { type:error instanceof Error ? error.name : "Unknown" });
    return null;
  }
}

async function transcribeAudioWithOpenAi(base64: string, mimeType: string) {
  const key = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) return "";
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return "";
  }
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) return "";
  const configured = String(process.env.OPENAI_TRANSCRIBE_MODEL ?? "").trim();
  const models = configured ? [configured] : ["gpt-transcribe", "gpt-4o-mini-transcribe"];
  const safeMime = mimeType.split(";")[0].trim() || "audio/ogg";
  for (const model of models) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type:safeMime }), `audio.${audioExtension(safeMime)}`);
      form.append("model", model);
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method:"POST",
        headers:{ authorization:`Bearer ${key}` },
        body:form,
        signal:AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        console.warn("ca_atende_audio_transcription_unavailable", { status:response.status, model });
        continue;
      }
      const body = await response.json().catch(() => ({})) as { text?: string };
      const transcript = String(body.text ?? "").trim().slice(0,3500);
      if (transcript) return transcript;
    } catch (error) {
      console.warn("ca_atende_audio_transcription_unavailable", { type:error instanceof Error ? error.name : "Unknown", model });
    }
  }
  return "";
}

export type EvolutionInboundAudioEvent = {
  organizationId:number;
  messageRowId:number;
  providerMessageId:string;
  phone:string;
  senderName?:string;
  receivedAt:string;
  instanceName:string;
  data:Record<string, unknown>;
};

export async function transcribeEvolutionAudioEvent(event: EvolutionInboundAudioEvent): Promise<WhatsappInboundTextEvent | null> {
  const message = evolutionMessage(event.data);
  const embedded = String(message.speechToText ?? "").replace(/^\[audio\]\s*/i, "").trim().slice(0,3500);
  let text = embedded;
  if (!text) {
    const media = await evolutionAudioMedia(event.instanceName, event.data);
    if (!media) return null;
    text = await transcribeAudioWithOpenAi(media.base64, media.mimeType);
  }
  if (!text) return null;
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  await db.update(whatsappMessages).set({
    kind:"inbound_audio_transcribed",
    payloadJson:JSON.stringify({ ...event.data, caTranscription:text }),
    updatedAt,
  }).where(and(
    eq(whatsappMessages.organizationId, event.organizationId),
    eq(whatsappMessages.id, event.messageRowId),
  ));
  await db.insert(whatsappConversations).values({
    organizationId:event.organizationId,
    phone:event.phone,
    lastInboundAt:event.receivedAt,
    lastInboundPreview:`Áudio: ${text}`.slice(0,240),
    updatedAt,
  }).onConflictDoUpdate({
    target:[whatsappConversations.organizationId, whatsappConversations.phone],
    set:{ lastInboundAt:event.receivedAt, lastInboundPreview:`Áudio: ${text}`.slice(0,240), updatedAt },
  });
  return {
    organizationId:event.organizationId,
    messageRowId:event.messageRowId,
    providerMessageId:event.providerMessageId,
    phone:event.phone,
    senderName:event.senderName,
    text,
    receivedAt:event.receivedAt,
  };
}
'''
text = text.replace(inbound_func, helpers, 1)

old_type = 'export type EvolutionWebhookResult = { received:number; statuses:number; inboundTextEvents:WhatsappInboundTextEvent[] };'
new_type = 'export type EvolutionWebhookResult = { received:number; statuses:number; inboundTextEvents:WhatsappInboundTextEvent[]; inboundAudioEvents:EvolutionInboundAudioEvent[] };'
if text.count(old_type) != 1:
    raise SystemExit("db/evolution-whatsapp.ts: EvolutionWebhookResult não encontrado")
text = text.replace(old_type, new_type, 1)
text = text.replace('inboundTextEvents:[] }', 'inboundTextEvents:[], inboundAudioEvents:[] }')

old_insert = '''  const inserted = await db.insert(whatsappMessages).values({
    organizationId:connection.organizationId,
    appointmentId:null,
    direction:"inbound",
    kind:text ? "inbound_text" : `inbound_${String(data.messageType ?? "unknown")}`,
    phone,
'''
new_insert = '''  const isAudio = !text && isEvolutionAudioMessage(data);
  const inserted = await db.insert(whatsappMessages).values({
    organizationId:connection.organizationId,
    appointmentId:null,
    direction:"inbound",
    kind:text ? "inbound_text" : isAudio ? "inbound_audio" : `inbound_${String(data.messageType ?? "unknown")}`,
    phone,
'''
if text.count(old_insert) != 1:
    raise SystemExit("db/evolution-whatsapp.ts: insert inbound não encontrado")
text = text.replace(old_insert, new_insert, 1)

old_tail = '''  const preview = text.slice(0,240);
  await db.insert(whatsappConversations).values({ organizationId:connection.organizationId, phone, lastInboundAt:receivedAt, lastInboundPreview:preview, updatedAt:receivedAt }).onConflictDoUpdate({
    target:[whatsappConversations.organizationId, whatsappConversations.phone],
    set:{ lastInboundAt:receivedAt, lastInboundPreview:preview, updatedAt:receivedAt },
  });
  const inboundTextEvents: WhatsappInboundTextEvent[] = text ? [{ organizationId:connection.organizationId, messageRowId:inserted[0].id, providerMessageId, phone, senderName:senderName || undefined, text, receivedAt }] : [];
  return { received:1, statuses:0, inboundTextEvents };
}
'''
new_tail = '''  const preview = text ? text.slice(0,240) : isAudio ? "Áudio recebido" : "";
  await db.insert(whatsappConversations).values({ organizationId:connection.organizationId, phone, lastInboundAt:receivedAt, lastInboundPreview:preview, updatedAt:receivedAt }).onConflictDoUpdate({
    target:[whatsappConversations.organizationId, whatsappConversations.phone],
    set:{ lastInboundAt:receivedAt, lastInboundPreview:preview, updatedAt:receivedAt },
  });
  const inboundTextEvents: WhatsappInboundTextEvent[] = text ? [{ organizationId:connection.organizationId, messageRowId:inserted[0].id, providerMessageId, phone, senderName:senderName || undefined, text, receivedAt }] : [];
  const inboundAudioEvents: EvolutionInboundAudioEvent[] = isAudio ? [{ organizationId:connection.organizationId, messageRowId:inserted[0].id, providerMessageId, phone, senderName:senderName || undefined, receivedAt, instanceName:name, data }] : [];
  return { received:1, statuses:0, inboundTextEvents, inboundAudioEvents };
}
'''
if text.count(old_tail) != 1:
    raise SystemExit("db/evolution-whatsapp.ts: tail inbound não encontrado")
text = text.replace(old_tail, new_tail, 1)
evolution.write_text(text)

# 4) Keep webhook response fast; audio transcription runs in Next.js after().
route = Path("app/api/whatsapp/evolution/webhook/route.ts")
text = route.read_text()
text = text.replace(
    "  processEvolutionWhatsappQueue,\n  validEvolutionWebhookAuthorization,",
    "  processEvolutionWhatsappQueue,\n  transcribeEvolutionAudioEvent,\n  validEvolutionWebhookAuthorization,",
    1,
)
text = text.replace(
    'import { processCaAtendeInboundSafely } from "../../../../../db/ca-atende";\n',
    'import { processCaAtendeInboundSafely } from "../../../../../db/ca-atende";\nimport { queueWhatsappTextReply } from "../../../../../db/whatsapp";\n',
    1,
)
old_after = '''    if (result.inboundTextEvents.length) {
      after(async () => {
        for (const event of result.inboundTextEvents) {
          await processCaAtendeInboundSafely(event);
          // A fila filtra o provedor antes do envio; apenas a Evolution pode
          // processar as respostas desta conexão.
          await processEvolutionWhatsappQueue({ organizationId:event.organizationId, limit:2 });
        }
      });
    }
'''
new_after = '''    if (result.inboundTextEvents.length || result.inboundAudioEvents.length) {
      after(async () => {
        const events = [...result.inboundTextEvents];
        for (const audioEvent of result.inboundAudioEvents) {
          const transcribed = await transcribeEvolutionAudioEvent(audioEvent);
          if (transcribed) {
            events.push(transcribed);
          } else {
            await queueWhatsappTextReply({
              organizationId:audioEvent.organizationId,
              phone:audioEvent.phone,
              inboundProviderMessageId:audioEvent.providerMessageId,
              text:"Não consegui entender esse áudio. Pode mandar de novo ou escrever a mensagem pra mim?",
            });
            await processEvolutionWhatsappQueue({ organizationId:audioEvent.organizationId, limit:2 });
          }
        }
        for (const event of events) {
          await processCaAtendeInboundSafely(event);
          // A fila filtra o provedor antes do envio; apenas a Evolution pode
          // processar as respostas desta conexão.
          await processEvolutionWhatsappQueue({ organizationId:event.organizationId, limit:2 });
        }
      });
    }
'''
if text.count(old_after) != 1:
    raise SystemExit("route evolution: bloco after não encontrado")
text = text.replace(old_after, new_after, 1)
route.write_text(text)

# 5) Update old contract that explicitly required rule-first behavior.
test_path = Path("tests/ca-atende.test.mjs")
text = test_path.read_text()
old_test = '''test("pedidos claros usam regra; IA interpreta somente linguagem ambígua", () => {
  assert.match(botDb, /if \\(rule\\.intent !== "unknown"\\) return rule/);
  assert.match(botDb, /if \\(bookingContinuation\\) return/);
  assert.match(botDb, /if \\(context\\.settings\\.aiFallbackEnabled\\)/);
  assert.match(botDb, /interpretCaAtendeWithAi/);
  assert.match(botDb, /interpretation\\.intent === "unknown"/);
});
'''
new_test = '''test("IA interpreta linguagem natural primeiro e regras continuam como proteção", () => {
  const aiCall = botDb.indexOf("const ai = await interpretCaAtendeWithAi");
  const ruleFallback = botDb.indexOf('if (rule.intent !== "unknown") return rule', aiCall);
  assert.ok(aiCall >= 0 && ruleFallback > aiCall);
  assert.match(botDb, /rule\\.intent === "cancel"/);
  assert.match(botDb, /rule\\.intent === "reschedule"/);
  assert.match(botDb, /if \\(bookingContinuation\\) return/);
  assert.match(botDb, /state,/);
});
'''
if text.count(old_test) != 1:
    raise SystemExit("tests/ca-atende.test.mjs: teste rule-first não encontrado")
text = text.replace(old_test, new_test, 1)
test_path.write_text(text)

Path("tests/ca-atende-audio-ai-first-contract.test.mjs").write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bot, model, evolution, route] = await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/ca-atende-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/evolution/webhook/route.ts", import.meta.url), "utf8"),
]);

test("C.A. Atende usa IA antes do fallback de regras para linguagem natural", () => {
  const aiCall = bot.indexOf("const ai = await interpretCaAtendeWithAi");
  const ruleFallback = bot.indexOf('if (rule.intent !== "unknown") return rule', aiCall);
  assert.ok(aiCall >= 0);
  assert.ok(ruleFallback > aiCall);
  assert.match(bot, /state,/);
  assert.match(model, /state\?: string/);
  assert.match(model, /Etapa atual do atendimento/);
  assert.match(model, /transcrições de áudio com sotaque/);
});

test("áudio recebido pela Evolution é baixado e transcrito fora da resposta do webhook", () => {
  assert.match(evolution, /getBase64FromMediaMessage/);
  assert.match(evolution, /audio\/transcriptions/);
  assert.match(evolution, /gpt-transcribe/);
  assert.match(evolution, /gpt-4o-mini-transcribe/);
  assert.match(evolution, /EvolutionInboundAudioEvent/);
  assert.match(evolution, /inbound_audio_transcribed/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /transcribeEvolutionAudioEvent/);
  assert.match(route, /Não consegui entender esse áudio/);
});

test("ações críticas continuam protegidas por regras determinísticas", () => {
  assert.match(bot, /rule\.intent === "spam"/);
  assert.match(bot, /rule\.intent === "human"/);
  assert.match(bot, /rule\.intent === "cancel"/);
  assert.match(bot, /rule\.intent === "reschedule"/);
  assert.match(bot, /getPublicBookingSlotsExpanded/);
});
''')

print("patch aplicado")
