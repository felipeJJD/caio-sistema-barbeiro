import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smart = await readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8");

test("mensagem desconhecida sem IA pergunta uma vez em vez de voltar para saudação/link", () => {
  const unknownRule = smart.indexOf('if (rule.intent !== "unknown")');
  const noAi = smart.indexOf('if (!context.aiEnabled) return queueClarification', unknownRule);
  const aiCall = smart.indexOf('const ai = await interpretCaAtendeWithAi', noAi);
  assert.ok(unknownRule >= 0);
  assert.ok(noAi > unknownRule);
  assert.ok(aiCall > noAi);
  assert.match(smart, /Não entendi certinho/);
});

test("humano explícito transfere; IA indisponível ou unknown esclarece antes do handoff", () => {
  assert.match(smart, /if \(ai\?\.intent === "human"\) return queueHumanHandoff/);
  assert.match(smart, /if \(!ai \|\| ai\.intent === "unknown"\) return queueClarification/);
  assert.match(smart, /conversation\?\.botState === "smart_clarify"/);
  assert.match(smart, /return queueHumanHandoff\(event, context\)/);
  assert.match(smart, /pauseReason: "human_takeover"/);
});
