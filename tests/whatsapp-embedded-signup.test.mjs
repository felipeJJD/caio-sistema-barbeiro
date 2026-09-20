import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dbWhatsapp, connectRoute, settingsRoute, ui, migration, envExample] = await Promise.all([
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/connect/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/settings/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0044_whatsapp_embedded_signup.sql", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
]);

test("Embedded Signup só fica disponível com configuração oficial completa da Meta", () => {
  assert.match(dbWhatsapp, /WHATSAPP_APP_ID/);
  assert.match(dbWhatsapp, /WHATSAPP_APP_SECRET/);
  assert.match(dbWhatsapp, /WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID/);
  assert.match(dbWhatsapp, /WHATSAPP_GRAPH_VERSION/);
  assert.match(dbWhatsapp, /ready,/);
  assert.match(envExample, /WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=/);
});

test("App Secret nunca é enviado para o navegador", () => {
  assert.doesNotMatch(ui, /WHATSAPP_APP_SECRET/);
  assert.doesNotMatch(connectRoute, /appSecret:/);
  assert.match(dbWhatsapp, /appSecret: String\(process\.env\.WHATSAPP_APP_SECRET/);
});

test("navegador usa Login for Business com código de autorização", () => {
  assert.match(ui, /config_id: signupConfig\.configId/);
  assert.match(ui, /response_type: "code"/);
  assert.match(ui, /override_default_response_type: true/);
  assert.match(ui, /WA_EMBEDDED_SIGNUP/);
  assert.match(ui, /authResponse\?\.code/);
});

test("modo coexistência preserva caminho para quem já usa WhatsApp Business no celular", () => {
  assert.match(ui, /featureType = "whatsapp_business_app_onboarding"/);
  assert.match(ui, /launchEmbeddedSignup\("coexistence"\)/);
  assert.match(ui, /Conectar meu WhatsApp atual/);
  assert.match(dbWhatsapp, /mode === "coexistence"/);
});

test("servidor troca o código sem expor token ao cliente e valida o app", () => {
  assert.match(dbWhatsapp, /oauth\/access_token/);
  assert.match(dbWhatsapp, /debug_token/);
  assert.match(dbWhatsapp, /String\(debug\.app_id/);
  assert.match(dbWhatsapp, /whatsapp_business_management/);
  assert.match(dbWhatsapp, /whatsapp_business_messaging/);
  assert.doesNotMatch(connectRoute, /accessToken/);
});

test("WABA e telefone enviados pelo navegador são revalidados na Meta", () => {
  assert.match(dbWhatsapp, /phone_numbers/);
  assert.match(dbWhatsapp, /const phone = \(body\.data \?\? \[\]\)\.find/);
  assert.match(dbWhatsapp, /O número selecionado não pertence à conta do WhatsApp autorizada/);
});

test("aplicativo assina os webhooks da WABA após autorização", () => {
  assert.match(dbWhatsapp, /subscribed_apps/);
  assert.match(dbWhatsapp, /subscribeWhatsappWebhook/);
  assert.match(dbWhatsapp, /webhookSubscribedAt: now/);
});

test("Cloud API registra o número com PIN protegido e coexistência não força registro", () => {
  assert.match(dbWhatsapp, /registerWhatsappPhone/);
  assert.match(dbWhatsapp, /messaging_product: "whatsapp", pin/);
  assert.match(dbWhatsapp, /if \(mode === "cloud"\)/);
  assert.match(dbWhatsapp, /encryptSecret\(pin\)/);
  assert.match(migration, /encrypted_registration_pin/);
  assert.match(migration, /registration_pin_iv/);
});

test("token do cliente é criptografado antes de persistir", () => {
  assert.match(dbWhatsapp, /encryptSecret\(exchanged\.accessToken\)/);
  assert.match(dbWhatsapp, /encryptedAccessToken: protectedToken\.encryptedValue/);
  assert.match(migration, /token_expires_at/);
});

test("um número não pode ser conectado a duas barbearias", () => {
  assert.match(dbWhatsapp, /occupied\.organizationId !== access\.organizationId/);
  assert.match(dbWhatsapp, /já está conectado a outra barbearia/);
});

test("rota de conexão exige sessão de proprietário e acesso ativo", () => {
  assert.match(connectRoute, /getSessionAccess/);
  assert.match(connectRoute, /!access\.isOwner/);
  assert.match(connectRoute, /isOrganizationAccessExpired/);
});

test("conexão manual por token foi removida da API do proprietário", () => {
  assert.doesNotMatch(settingsRoute, /connect-manual/);
  assert.doesNotMatch(settingsRoute, /accessToken/);
});

test("ao desconectar o sistema tenta cancelar a assinatura de webhook e apaga segredos locais", () => {
  assert.match(dbWhatsapp, /method: "DELETE"/);
  assert.match(dbWhatsapp, /encryptedAccessToken: ""/);
  assert.match(dbWhatsapp, /encryptedRegistrationPin: ""/);
});
