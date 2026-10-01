import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smart = await readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8");

test("mensagem desconhecida sem IA faz handoff em vez de voltar para saudação/link", () => {
  const unknownRule = smart.indexOf('if (rule.intent !== "unknown")');
  const noAi = smart.indexOf('if (!context.aiEnabled) return queueHumanHandoff', unknownRule);
  const aiCall = smart.indexOf('const ai = await interpretCaAtendeWithAi', noAi);
  assert.ok(unknownRule >= 0);
  assert.ok(noAi > unknownRule);
  assert.ok(aiCall > noAi);
});

test("IA indisponível, human ou unknown terminam no mesmo handoff humano", () => {
  assert.match(smart, /if \(!ai \|\| ai\.intent === "human" \|\| ai\.intent === "unknown"\) return queueHumanHandoff/);
  assert.match(smart, /pauseReason: "human_takeover"/);
});