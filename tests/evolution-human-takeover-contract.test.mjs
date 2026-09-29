import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../db/evolution-whatsapp.ts",import.meta.url),"utf8");

test("mensagem manual enviada pela barbearia assume a conversa",()=>{
  assert.doesNotMatch(source,/if \(Boolean\(key\.fromMe\)\) return/);
  assert.match(source,/pauseReason:"human_takeover"/);
  assert.match(source,/botState:"human_takeover"/);
  assert.match(source,/automationPausedUntil:null/);
});

test("eco de mensagem do próprio sistema não é confundido com atendimento humano",()=>{
  assert.match(source,/knownSystemMessage/);
  assert.match(source,/systemSendsInFlight/);
  assert.match(source,/matchingSystemEcho/);
  assert.match(source,/normalizedOutgoingText/);
  assert.match(source,/evolutionText\(message\.kind, queuedPayload\)/);
  assert.match(source,/providerMessageId/);
  assert.match(source,/direction, "outbound"/);
});

test("fila Evolution não envia bot_text durante atendimento humano",()=>{
  assert.match(source,/message\.kind === "bot_text"/);
  assert.match(source,/pausedByHuman/);
  assert.match(source,/Atendimento assumido manualmente no WhatsApp/);
  assert.match(source,/status:"cancelled"/);
});
