import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [dashboardDb, authDb, dashboardUi, helpUi, publicBookingUi, ownerEmail] = await Promise.all([
  readFile(new URL("../db/dashboard.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/dashboard-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/help-assistant.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/public-booking-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/owner-email.ts", import.meta.url), "utf8"),
]);

test("membership payments use the real payment date and repair the old day-eight snapshot", () => {
  assert.doesNotMatch(dashboardDb, /occurredAt:\s*`\$\{input\.paidMonth\}-08`/);
  assert.match(dashboardDb, /occurredAt:\s*today/);
  assert.match(dashboardDb, /legacyFuturePayments/);
});

test("public signup validates duplicate data before consuming the rate limit", () => {
  const emailCheck = authDb.indexOf("assertBarbershopEmailAvailable(registration.email)");
  const rateLimit = authDb.lastIndexOf("enforcePublicSignupRateLimit(input.requestIp, registration.email)");
  assert.ok(emailCheck >= 0 && rateLimit > emailCheck);
  assert.match(authDb, /sha256\(`\$\{ip\}:\$\{email\}`\)/);
  assert.match(authDb, /15 \* 60 \* 1000/);
});

test("WhatsApp reminders return correctly to the installed iPhone app", () => {
  assert.match(dashboardUi, /target="_blank"/);
  assert.match(dashboardUi, /Avisar no WhatsApp/);
  assert.match(dashboardUi, /window\.open\(url, "_blank"/);
  assert.match(dashboardUi, /whatsapp:\/\/send\?phone=/);
  assert.match(dashboardUi, /display-mode: standalone/);
});

test("public gallery photos open in an accessible lightbox", () => {
  assert.match(publicBookingUi, /public-gallery-lightbox/);
  assert.match(publicBookingUi, /aria-modal="true"/);
  assert.match(publicBookingUi, /Toque para ampliar/);
});

test("voice help keeps the composer clean and sends on the second tap", () => {
  assert.match(helpUi, /Ouvindo\.\.\. fale normalmente/);
  assert.match(helpUi, /createHelpDictation/);
  assert.match(helpUi, /voiceTextRef/);
  assert.match(helpUi, /void ask\(spoken\)/);
  assert.match(helpUi, /Enviar mensagem de voz/);
});

test("help starts with a conversation and keeps human support available", () => {
  assert.match(helpUi, /Assistente Cortou Anotou/);
  assert.match(helpUi, /Falar com o suporte/);
  assert.doesNotMatch(helpUi, /Falar com o Kaio/);
  assert.match(helpUi, /Escreva sua dúvida/);
  assert.doesNotMatch(helpUi, /help-action-shortcuts/);
  assert.doesNotMatch(helpUi, /Atendimento salvo pelo assistente/);
});

test("password reset email has a tappable button and a visible fallback link", () => {
  assert.match(ownerEmail, /Redefinir minha senha/);
  assert.match(ownerEmail, /target="_blank"/);
  assert.match(ownerEmail, /Se o botão não abrir/);
  assert.match(ownerEmail, /word-break:break-all/);
  assert.ok((ownerEmail.match(/href="\$\{safeResetUrl\}"/g) ?? []).length >= 2);
});
