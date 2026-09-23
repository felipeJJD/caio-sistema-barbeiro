import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const notifications = () => readFile(new URL("../db/notifications.ts", import.meta.url), "utf8");

test("push de atendimento registra etapas sem impedir o atendimento", async () => {
  const source = await notifications();
  assert.match(source, /attendance-no-subscription/);
  assert.match(source, /attendance-delivery/);
  assert.match(source, /pushError\("attendance"/);
  assert.match(source, /O atendimento nunca pode deixar de ser salvo por uma falha de notificação/);
});

test("assinaturas expiradas retornadas pelo serviço de push são removidas", async () => {
  const source = await notifications();
  assert.match(source, /result\.gone\.length/);
  assert.match(source, /delete\(pushSubscriptions\)/);
});
