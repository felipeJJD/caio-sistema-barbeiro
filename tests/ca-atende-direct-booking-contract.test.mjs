import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bot, publicBooking, whatsapp, evolution, memory] = await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/ca-atende.ts", import.meta.url), "utf8"),
]);

test("C.A. Atende conclui agendamento real sem devolver o cliente ao link", () => {
  assert.match(bot, /createPublicBooking\(context\.organization\.slug/);
  assert.match(bot, /source:"ca_atende"/);
  assert.match(bot, /skipImmediateWhatsappConfirmation:true/);
  assert.doesNotMatch(bot, /Para concluir o agendamento real com segurança, finalize aqui/);
});

test("coleta somente dados ausentes e preserva contexto", () => {
  assert.match(bot, /awaiting_client_name/);
  assert.match(bot, /awaiting_payment/);
  assert.match(memory, /clientName\?: string/);
  assert.match(memory, /paymentChoice\?: string/);
});

test("Evolution repassa pushName como nome opcional do cliente", () => {
  assert.match(whatsapp, /senderName\?: string/);
  assert.match(evolution, /data\.pushName/);
  assert.match(evolution, /senderName:senderName \|\| undefined/);
});

test("agendamento pelo bot mantém lembrete sem duplicar confirmação", () => {
  assert.match(publicBooking, /queueAppointmentReminderOnlySafely/);
  assert.match(whatsapp, /export async function queueAppointmentReminderOnly/);
  assert.match(publicBooking, /Solicitado pelo C\.A\. Atende/);
});
