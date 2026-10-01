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
const [smartDb, flowDb, model, migration, journal] = await Promise.all([
  readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/ca-atende-flow.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/ca-atende-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0051_ca_atende_flow_tags.sql", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
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

test("fluxo de boas-vindas usa tag persistente com validade fixa de cinco dias", () => {
  assert.match(flowDb, /CA_ATENDE_FLOW_TTL_MS = 5 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(flowDb, /startedAt/);
  assert.match(flowDb, /expiresAt/);
  assert.match(smartDb, /getCaAtendeFlowState/);
  assert.match(smartDb, /if \(!flow\.active\)/);
  assert.match(smartDb, /startFlow: true/);
  assert.doesNotMatch(smartDb, /ACTIVE_CONVERSATION_MS/);
});

test("migration da tag de fluxo é aditiva e registrada no journal", () => {
  assert.match(migration, /CREATE TABLE `ca_atende_flow_tags`/);
  assert.match(migration, /PRIMARY KEY\(`organization_id`, `phone`\)/);
  assert.match(migration, /`started_at` text NOT NULL/);
  assert.match(migration, /`expires_at` text NOT NULL/);
  assert.match(journal, /0051_ca_atende_flow_tags/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test("mensagens dentro da janela não repetem saudação completa nem link", () => {
  assert.match(smartDb, /Enquanto estiver ativa, nenhuma mensagem repete a saudação completa ou o link/);
  assert.match(smartDb, /Durante os cinco dias do fluxo, um novo cumprimento nunca repete a abertura/);
  assert.match(smartDb, /Oi! Pode falar, como posso te ajudar\?/);
});

test("mensagem desconhecida pede esclarecimento antes de notificar atendimento humano", () => {
  assert.match(smartDb, /state: "smart_clarify"/);
  assert.match(smartDb, /Não entendi certinho/);
  assert.match(smartDb, /conversation\?\.botState === "smart_clarify"/);
});

test("modelo recebe regra explícita para serviço de barbearia não virar humano", () => {
  assert.match(model, /quero fazer um corte/);
  assert.match(model, /nunca classifique como human/);
  assert.match(model, /significam booking/);
});
