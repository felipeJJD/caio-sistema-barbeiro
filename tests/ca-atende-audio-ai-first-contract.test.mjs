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

test("porta de entrada envia saudação, link e escolha antes de interpretar a primeira mensagem", () => {
  assert.match(smart, /ACTIVE_CONVERSATION_MS = 30 \* 60 \* 1000/);
  assert.match(smart, /if \(!isActive\)/);
  assert.match(smart, /state: "entry_choice"/);
  assert.match(smart, /resetConversation: true/);
  assert.match(smart, /Para agendar seu horário, use nosso link/);
  assert.match(smart, /1 - Continuar por aqui/);
  assert.match(smart, /2 - Falar com alguém da barbearia/);
  const welcomeGate = smart.indexOf("if (!isActive)");
  const rule = smart.indexOf("const rule = classifyCaAtendeByRule", welcomeGate);
  assert.ok(welcomeGate >= 0 && rule > welcomeGate, "a primeira mensagem deve passar pela porta de entrada antes da intenção");
});

test("humano explícito faz handoff; incompreensível pede esclarecimento antes", () => {
  assert.match(smart, /explicitBarbershopRequest/);
  assert.match(smart, /ai\?\.intent === "human"/);
  assert.match(smart, /ai\.intent === "unknown"/);
  assert.match(smart, /queueClarification/);
  assert.match(smart, /state: "smart_clarify"/);
  assert.match(smart, /pauseReason: "human_takeover"/);
  assert.match(smart, /notifyOwnersOfWhatsappHandoff/);
});

test("pedido de pessoa por nome ou apelido é humano, mas escolher profissional para serviço não é", () => {
  assert.match(model, /quero falar com o João/);
  assert.match(model, /me passa pro tigrão/);
  assert.match(model, /quero cortar com João/);
  assert.match(model, /Fala tigrão/);
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
