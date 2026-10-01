import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bot, smart, model, audio, route] = await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/ca-atende-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/evolution-audio.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/evolution/webhook/route.ts", import.meta.url), "utf8"),
]);

test("modelo do C.A. Atende recebe etapa, memória e conversa recente", () => {
  assert.match(model, /state\?: string/);
  assert.match(model, /recentMessages\?: RecentCaAtendeMessage\[\]/);
  assert.match(model, /Etapa atual:/);
  assert.match(model, /Memória estruturada:/);
  assert.match(model, /Conversa recente/);
  assert.match(model, /transcrição de áudio com sotaques/);
  assert.match(model, /gpt-5\.6-sol/);
});

test("interpretação natural usa IA antes do fallback comum de regras", () => {
  const aiCall = bot.indexOf("const ai = await interpretCaAtendeWithAi");
  const ruleFallback = bot.indexOf('if (rule.intent !== "unknown") return rule', aiCall);
  assert.ok(aiCall >= 0, "chamada da IA não encontrada");
  assert.ok(ruleFallback > aiCall, "fallback de regras deve vir depois da IA");
  assert.match(bot, /state,/);
});

test("guarda inteligente evita repetir saudação e link na conversa ativa", () => {
  assert.match(smart, /ACTIVE_CONVERSATION_MS/);
  assert.match(smart, /rule\.intent === "greeting"/);
  assert.match(smart, /Fala! Pode mandar o que você precisa\./);
  assert.match(smart, /Se preferir, pode falar comigo por aqui que eu te ajudo\./);
  assert.match(smart, /recentConversation/);
});

test("assunto humano ou incompreensível encerra a automação em vez de cair no link", () => {
  assert.match(smart, /explicitBarbershopRequest/);
  assert.match(smart, /ai\.intent === "human"/);
  assert.match(smart, /ai\.intent === "unknown"/);
  assert.match(smart, /pauseReason: "human_takeover"/);
  assert.match(smart, /notifyOwnersOfWhatsappHandoff/);
});

test("cancelamento, remarcação, spam e humano mantêm proteção determinística", () => {
  assert.match(bot, /rule\.intent === "spam"/);
  assert.match(bot, /rule\.intent === "human"/);
  assert.match(bot, /rule\.intent === "cancel"/);
  assert.match(bot, /rule\.intent === "reschedule"/);
  assert.match(bot, /getPublicBookingSlotsExpanded/);
});

test("áudio Evolution é buscado sob demanda e transcrito com OpenAI", () => {
  assert.match(audio, /getBase64FromMediaMessage/);
  assert.match(audio, /OPENAI_API_KEY/);
  assert.match(audio, /gpt-4o-mini-transcribe/);
  assert.match(audio, /audio\/transcriptions/);
  assert.match(audio, /inbound_audio_transcribed/);
  assert.doesNotMatch(audio, /EVOLUTION_WEBHOOK_SECRET/);
});

test("transcrição roda depois do ACK do webhook e entra na guarda inteligente", () => {
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /transcribeEvolutionAudioWebhook/);
  assert.match(route, /processCaAtendeSmartInboundSafely/);
  assert.match(route, /Não consegui entender esse áudio/);
});