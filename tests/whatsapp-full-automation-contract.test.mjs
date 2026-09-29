import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("ações da agenda despacham a fila também pela Evolution", async () => {
  const dashboard = await source("db/dashboard.ts");
  assert.match(dashboard, /processConnectedWhatsappQueueSafely\(access\.organizationId, 3\)/);
  assert.doesNotMatch(dashboard, /processWhatsappQueueSafely\(access\.organizationId, 3\)/);
});

test("agendamento público e gestão reaproveitam o despacho do provedor conectado", async () => {
  const booking = await source("db/public-booking.ts");
  assert.match(booking, /processConnectedWhatsappQueueSafely/);
  assert.match(booking, /cancelWhatsappManagedBooking/);
  assert.match(booking, /rescheduleWhatsappManagedBooking/);
  assert.match(booking, /sameWhatsappPhone/);
});

test("worker periódico processa lembretes sem depender de nova mensagem do cliente", async () => {
  const worker = await source("scripts/whatsapp-worker.mjs");
  const start = await source("scripts/start.mjs");
  assert.match(worker, /\/api\/whatsapp\/jobs/);
  assert.match(worker, /setInterval\(runWhatsappJobs, intervalMs\)/);
  assert.doesNotMatch(worker, /\.unref/);
  assert.match(start, /whatsapp-worker\.mjs/);
});
