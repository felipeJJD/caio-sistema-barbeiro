import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [smart, notifications] = await Promise.all([
  readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/notifications.ts", import.meta.url), "utf8"),
]);

test("handoff humano pausa o C.A. sem disparar notificação interna para o proprietário", () => {
  assert.doesNotMatch(smart, /notifyOwnersOfWhatsappHandoff/);
  assert.doesNotMatch(smart, /whatsapp-human-handoff/);
  assert.match(smart, /pauseReason: "human_takeover"/);
  assert.match(smart, /botState: "human_takeover"/);
  assert.match(smart, /handoff: true/);

  const handoffNotifier = notifications.match(/export async function notifyOwnersOfWhatsappHandoff[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.match(handoffNotifier, /void input/);
  assert.doesNotMatch(handoffNotifier, /deliverNotification/);
  assert.doesNotMatch(handoffNotifier, /whatsapp-human-handoff/);
  assert.doesNotMatch(handoffNotifier, /Cliente pediu atendimento humano/);
});
