import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [statusDb, statusRoute, statusUi, jobsRoute, worker] = await Promise.all([
  readFile(new URL("../db/whatsapp-status.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/status-publications/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-status-publications.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/jobs/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../scripts/whatsapp-worker.mjs", import.meta.url), "utf8"),
]);

test("Status usa endpoint próprio da Evolution com audiência explícita e nunca sendText", () => {
  assert.match(statusDb, /\/message\/sendStatus\//);
  assert.match(statusDb, /type: "text"/);
  assert.match(statusDb, /allContacts: false/);
  assert.match(statusDb, /statusJidList:/);
  assert.match(statusDb, /status@broadcast/);
  assert.doesNotMatch(statusDb, /\/message\/sendText\//);
});

test("publicação exige número de teste e persiste a audiência para o agendamento", () => {
  assert.match(statusDb, /audiencePhone/);
  assert.match(statusDb, /normalizeWhatsappPhone/);
  assert.match(statusRoute, /audiencePhone/);
  assert.match(statusUi, /NÚMERO PARA VISUALIZAR O TESTE/);
  assert.match(statusUi, /Não envia mensagem/);
});

test("fila de Status é isolada da fila normal e não faz retry cego", () => {
  assert.match(statusDb, /status_queued/);
  assert.match(statusDb, /status_sending/);
  assert.match(statusDb, /status_sent/);
  assert.match(statusDb, /status_failed/);
  assert.match(statusDb, /Confira o Status no WhatsApp antes de tentar novamente/);
  assert.doesNotMatch(statusDb, /evolutionRetryDelay/);
});

test("API exige proprietário e oferece publicar, agendar e cancelar", () => {
  assert.match(statusRoute, /Somente o proprietário pode programar Status/);
  assert.match(statusRoute, /action === "publish-now"/);
  assert.match(statusRoute, /action === "schedule"/);
  assert.match(statusRoute, /action === "cancel"/);
  assert.match(statusRoute, /processWhatsappStatusQueue/);
});

test("worker existente também processa publicações programadas", () => {
  assert.match(jobsRoute, /processWhatsappStatusQueue/);
  assert.match(jobsRoute, /statusPublications/);
  assert.match(worker, /const intervalMs = 60_000/);
  assert.match(worker, /\/api\/whatsapp\/jobs/);
});
