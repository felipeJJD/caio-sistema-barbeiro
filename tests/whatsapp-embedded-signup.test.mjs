import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dbWhatsapp, dbEvolution, connectRoute, evolutionRoute, settingsRoute, ui, migration, envExample] = await Promise.all([
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/connect/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/evolution/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/settings/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0044_whatsapp_embedded_signup.sql", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
]);

test("experiência ativa do proprietário usa Evolution dentro do menu", () => {
  assert.match(ui, /CONECTAR WHATSAPP/);
  assert.match(ui, /fetch\("\/api\/whatsapp\/evolution"/);
  assert.match(ui, /Gerar código/);
  assert.match(ui, /Seu código de conexão/);
  assert.doesNotMatch(ui, /CONEXÃO OFICIAL META/);
  assert.doesNotMatch(ui, /window\.FB|connect\.facebook\.net|WA_EMBEDDED_SIGNUP/);
});

test("segredos da Evolution nunca são enviados para o navegador", () => {
  assert.doesNotMatch(ui, /EVOLUTION_API_KEY|EVOLUTION_WEBHOOK_SECRET|AUTHENTICATION_API_KEY/);
  assert.match(dbEvolution, /process\.env\.EVOLUTION_API_KEY/);
  assert.match(dbEvolution, /process\.env\.EVOLUTION_WEBHOOK_SECRET/);
});

test("pareamento Evolution usa aparelho vinculado por organização", () => {
  assert.match(dbEvolution, /integration: "WHATSAPP-BAILEYS"/);
  assert.match(dbEvolution, /instanceName\(access\.organizationId\)/);
  assert.match(dbEvolution, /pairingCode/);
  assert.match(dbEvolution, /provider: "evolution"/);
  assert.match(dbEvolution, /onboardingMode: "linked_device"/);
});

test("rota Evolution exige proprietário e organização ativa", () => {
  assert.match(evolutionRoute, /getSessionAccess/);
  assert.match(evolutionRoute, /!access\.isOwner/);
  assert.match(evolutionRoute, /isOrganizationAccessExpired/);
  assert.match(evolutionRoute, /beginEvolutionPairing/);
});

test("backend legado da Meta mantém segredos somente no servidor enquanto está fora da interface", () => {
  assert.match(dbWhatsapp, /WHATSAPP_APP_ID/);
  assert.match(dbWhatsapp, /WHATSAPP_APP_SECRET/);
  assert.match(dbWhatsapp, /WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID/);
  assert.match(dbWhatsapp, /WHATSAPP_GRAPH_VERSION/);
  assert.match(envExample, /WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=/);
  assert.doesNotMatch(ui, /WHATSAPP_APP_SECRET|WHATSAPP_APP_ID|WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID/);
  assert.doesNotMatch(connectRoute, /appSecret:/);
});

test("servidor legado troca o código sem expor token ao cliente e valida o app", () => {
  assert.match(dbWhatsapp, /oauth\/access_token/);
  assert.match(dbWhatsapp, /debug_token/);
  assert.match(dbWhatsapp, /String\(debug\.app_id/);
  assert.match(dbWhatsapp, /whatsapp_business_management/);
  assert.match(dbWhatsapp, /whatsapp_business_messaging/);
  assert.doesNotMatch(connectRoute, /accessToken/);
});

test("WABA e telefone enviados pelo navegador legado são revalidados na Meta", () => {
  assert.match(dbWhatsapp, /phone_numbers/);
  assert.match(dbWhatsapp, /const phone = \(body\.data \?\? \[\]\)\.find/);
  assert.match(dbWhatsapp, /O número selecionado não pertence à conta do WhatsApp autorizada/);
});

test("backend legado assina os webhooks da WABA após autorização", () => {
  assert.match(dbWhatsapp, /subscribed_apps/);
  assert.match(dbWhatsapp, /subscribeWhatsappWebhook/);
  assert.match(dbWhatsapp, /webhookSubscribedAt: now/);
});

test("Cloud API legada registra o número com PIN protegido", () => {
  assert.match(dbWhatsapp, /registerWhatsappPhone/);
  assert.match(dbWhatsapp, /messaging_product: "whatsapp", pin/);
  assert.match(dbWhatsapp, /if \(mode === "cloud"\)/);
  assert.match(dbWhatsapp, /encryptSecret\(pin\)/);
  assert.match(migration, /encrypted_registration_pin/);
  assert.match(migration, /registration_pin_iv/);
});

test("token legado do cliente é criptografado antes de persistir", () => {
  assert.match(dbWhatsapp, /encryptSecret\(exchanged\.accessToken\)/);
  assert.match(dbWhatsapp, /encryptedAccessToken: protectedToken\.encryptedValue/);
  assert.match(migration, /token_expires_at/);
});

test("um número Evolution não pode ser conectado a duas barbearias", () => {
  assert.match(dbEvolution, /item\.organizationId !== access\.organizationId/);
  assert.match(dbEvolution, /já está conectado a outra barbearia/);
});

test("rota legada de conexão continua exigindo sessão de proprietário e acesso ativo", () => {
  assert.match(connectRoute, /getSessionAccess/);
  assert.match(connectRoute, /!access\.isOwner/);
  assert.match(connectRoute, /isOrganizationAccessExpired/);
});

test("conexão manual por token continua ausente da API do proprietário", () => {
  assert.doesNotMatch(settingsRoute, /connect-manual/);
  assert.doesNotMatch(settingsRoute, /accessToken/);
});

test("ao desconectar Evolution o sistema encerra a sessão e desliga automações", () => {
  assert.match(dbEvolution, /instance\/logout/);
  assert.match(dbEvolution, /status:"disconnected"/);
  assert.match(dbEvolution, /enabled:false/);
});
