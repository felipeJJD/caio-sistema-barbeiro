import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bot, model, audio, route] = await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/ca-atende-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/evolution-audio.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/evolution/webhook/route.ts", import.meta.url), "utf8"),
]);

test("modelo do C.A. Atende recebe etapa e memória da conversa", () => {
  assert.match(model, /state\?: string/);
  assert.match(model, /Etapa atual:/);
  assert.match(model, /Memória estruturada:/);
  assert.match(model, /transcrição de áudio com sotaques/);
  assert.match(model, /gpt-5\.6-luna/);
});

test("interpretação natural usa IA antes do fallback comum de regras", () => {
  const aiCall = bot.indexOf("const ai = await interpretCaAtendeWithAi");
  const ruleFallback = bot.indexOf('if (rule.intent !== "unknown") return rule', aiCall);
  assert.ok(aiCall >= 0, "chamada da IA não encontrada");
  assert.ok(ruleFallback > aiCall, "fallback de regras deve vir depois da IA");
  assert.match(bot, /state,/);
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

test("transcrição roda depois do ACK do webhook e entra no mesmo C.A. Atende", () => {
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /transcribeEvolutionAudioWebhook/);
  assert.match(route, /processCaAtendeInboundSafely/);
  assert.match(route, /Não consegui entender esse áudio/);
});
