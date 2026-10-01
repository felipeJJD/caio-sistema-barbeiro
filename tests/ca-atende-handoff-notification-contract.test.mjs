import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smart = await readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8");

test("handoff humano pausa o C.A. sem disparar notificação interna para o proprietário", () => {
  assert.doesNotMatch(smart, /notifyOwnersOfWhatsappHandoff/);
  assert.doesNotMatch(smart, /whatsapp-human-handoff/);
  assert.match(smart, /pauseReason: "human_takeover"/);
  assert.match(smart, /botState: "human_takeover"/);
  assert.match(smart, /handoff: true/);
});
