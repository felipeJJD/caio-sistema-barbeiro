import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const uiPath = new URL("../app/ui/affiliate-prospecting.tsx", import.meta.url);
const whatsappPath = new URL("../lib/affiliate-prospecting-whatsapp.ts", import.meta.url);

test("envio automático continua o lote quando um contato falha", async () => {
  const source = await readFile(uiPath, "utf8");
  assert.match(source, /const failed: Lead\[\] = \[\]/);
  assert.match(source, /failed\.push\(lead\)/);
  assert.match(source, /setAutomaticProgress\(index \+ 1\)/);
  assert.match(source, /setQueue\(failed\)/);
  assert.match(source, /ficou.*na fila para tentar novamente/);
});

test("erros da Evolution não viram object Object na tela", async () => {
  const source = await readFile(whatsappPath, "utf8");
  assert.match(source, /function evolutionErrorDetail/);
  assert.match(source, /replace\(\/\\\[object Object\\\]\/g/);
  assert.match(source, /O WhatsApp recusou esse número/);
});
