import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/affiliate-prospecting-whatsapp.ts", import.meta.url), "utf8");

test("instância dedicada configura webhook autenticado de respostas", () => {
  assert.match(source, /EVOLUTION_WEBHOOK_SECRET/);
  assert.match(source, /\/webhook\/set\/\$\{encodeURIComponent\(instance\)\}/);
  assert.match(source, /https:\/\/cortouanotou\.com\.br\/api\/whatsapp\/evolution\/webhook/);
  assert.match(source, /MESSAGES_UPSERT/);
  assert.match(source, /authorization:\s*`Bearer \$\{secret\}`/);
});

test("criação da instância já nasce com webhook", () => {
  assert.match(source, /webhook:\s*prospectingWebhook\(secret\)/);
});
