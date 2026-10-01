import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

async function load(entry) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

const helper = await load("../lib/ca-atende.ts");
const [smartDb, model] = await Promise.all([
  readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/ca-atende-model.ts", import.meta.url), "utf8"),
]);

test("regressão: pedidos naturais de corte são agendamento, nunca atendimento humano", () => {
  for (const message of [
    "Quero fazer um corte",
    "Irei cortar o cabelo?",
    "Vou cortar o cabelo amanhã",
    "Queria fazer a barba",
    "Preciso fazer um corte",
    "Bora cortar o cabelo",
  ]) {
    assert.equal(helper.classifyCaAtendeByRule(message).intent, "booking", message);
  }
});

test("negação não vira agendamento por engano", () => {
  assert.notEqual(helper.classifyCaAtendeByRule("não quero cortar o cabelo").intent, "booking");
});

test("conversa antiga não fica ativa por um dia inteiro", () => {
  assert.match(smartDb, /ACTIVE_CONVERSATION_MS = 30 \* 60 \* 1000/);
  assert.doesNotMatch(smartDb, /24 \* 60 \* 60 \* 1000/);
});

test("conversa só é ativa se ainda existir estado real do bot", () => {
  assert.match(smartDb, /function activeConversation\(lastBotReplyAt:[^,]+, botState:/);
  assert.match(smartDb, /!String\(botState \?\? ""\)\.trim\(\)/);
  assert.match(smartDb, /activeConversation\(conversation\?\.lastBotReplyAt, conversation\?\.botState\)/);
});

test("mensagem desconhecida pede esclarecimento antes de notificar atendimento humano", () => {
  assert.match(smartDb, /state: "smart_clarify"/);
  assert.match(smartDb, /Não entendi certinho/);
  assert.match(smartDb, /conversation\?\.botState === "smart_clarify"/);
});

test("cumprimento em conversa recente é curto sem repetir link", () => {
  assert.match(smartDb, /Oi! Pode falar, como posso te ajudar\?/);
});

test("modelo recebe regra explícita para serviço de barbearia não virar humano", () => {
  assert.match(model, /quero fazer um corte/);
  assert.match(model, /nunca classifique como human/);
  assert.match(model, /significam booking/);
});
