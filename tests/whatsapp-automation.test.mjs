import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

async function load(entry) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

const helper = await load("../lib/whatsapp.ts");
const [dbWhatsapp, webhookRoute, ownerSettingsRoute, platformRoute, dashboard, publicBooking, migration] = await Promise.all([
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/settings/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/platform/whatsapp/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/dashboard.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0043_whatsapp_automation_foundation.sql", import.meta.url), "utf8"),
]);

test("normaliza telefone brasileiro para o formato aceito pela Meta", () => {
  assert.equal(helper.normalizeWhatsappPhone("(41) 99999-1234"), "5541999991234");
  assert.equal(helper.normalizeWhatsappPhone("+55 41 99999-1234"), "5541999991234");
  assert.equal(helper.normalizeWhatsappPhone("0044 7700 900123"), "447700900123");
  assert.equal(helper.normalizeWhatsappPhone("123"), "");
});

test("calcula lembrete usando o horário local da agenda", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  assert.equal(
    helper.whatsappReminderAt("2026-09-21", "14:00", 3, now),
    "2026-09-21T14:00:00.000Z",
  );
  assert.equal(helper.whatsappReminderAt("invalido", "14:00", 3, now), null);
});

test("integração nasce desligada e sem pacote para impedir envio acidental", () => {
  assert.match(migration, /enabled[^\n]*DEFAULT false NOT NULL/);
  assert.match(migration, /plan_code[^\n]*DEFAULT 'off' NOT NULL/);
  assert.match(migration, /monthly_message_limit[^\n]*DEFAULT 0 NOT NULL/);
});

test("cada barbearia possui conexão, configurações, fila e conversa próprias", () => {
  assert.match(migration, /CREATE TABLE .*whatsapp_connections/);
  assert.match(migration, /CREATE TABLE .*whatsapp_automation_settings/);
  assert.match(migration, /CREATE TABLE .*whatsapp_messages/);
  assert.match(migration, /CREATE TABLE .*whatsapp_conversations/);
  assert.match(migration, /whatsapp_messages_org_dedupe_unique/);
  assert.match(migration, /whatsapp_conversations_org_phone_unique/);
});

test("envio usa diretamente a Cloud API e exige versão explícita", () => {
  assert.match(dbWhatsapp, /graph\.facebook\.com/);
  assert.match(dbWhatsapp, /WHATSAPP_GRAPH_VERSION/);
  assert.match(dbWhatsapp, /messaging_product: "whatsapp"/);
  assert.match(dbWhatsapp, /type: "template"/);
});

test("webhook exige token na verificação e assinatura HMAC no recebimento", () => {
  assert.match(webhookRoute, /WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(webhookRoute, /WHATSAPP_APP_SECRET/);
  assert.match(webhookRoute, /x-hub-signature-256/);
  assert.match(webhookRoute, /HMAC/);
});

test("proprietário não pode aumentar o próprio pacote de mensagens", () => {
  assert.doesNotMatch(ownerSettingsRoute, /action === "plan"/);
  assert.match(platformRoute, /access\.isPlatformAdmin/);
  assert.match(dbWhatsapp, /requirePlatformAdmin\(access\)/);
});

test("confirmação e cancelamento internos alimentam a automação", () => {
  assert.match(dashboard, /queueAppointmentWhatsappSafely\("confirmation", id\)/);
  assert.match(dashboard, /queueAppointmentWhatsappSafely\("cancellation", id\)/);
});

test("agendamento público automático, cancelamento e remarcação alimentam a automação", () => {
  assert.match(publicBooking, /status === "Agendado"/);
  assert.match(publicBooking, /queueAppointmentWhatsappSafely\("confirmation", appointmentId\)/);
  assert.match(publicBooking, /queueAppointmentWhatsappSafely\("cancellation", row\.appointmentId\)/);
  assert.match(publicBooking, /queueAppointmentWhatsappSafely\("rescheduled", row\.appointmentId\)/);
});

test("cancelar ou remarcar invalida lembretes antigos antes de qualquer novo envio", () => {
  assert.match(dbWhatsapp, /cancelPendingAppointmentMessages/);
  assert.match(dbWhatsapp, /"confirmation", "reminder", "rescheduled"/);
  assert.match(dbWhatsapp, /"reminder", "rescheduled"/);
});

test("mensagens recebidas são registradas separadas e não entram como envio do pacote", () => {
  assert.match(dbWhatsapp, /direction: "inbound"/);
  assert.match(dbWhatsapp, /lastInboundAt/);
  assert.match(dbWhatsapp, /eq\(whatsappMessages\.direction, "outbound"\)/);
});
