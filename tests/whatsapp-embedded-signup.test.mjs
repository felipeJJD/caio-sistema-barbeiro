import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [evolutionDb, legacyDb, connectRoute, settingsRoute, webhookRoute, jobsRoute, ui, envExample] = await Promise.all([
  readFile(new URL("../db/whatsapp-evolution.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/connect/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/settings/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/jobs/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
]);

test("Evolution só fica disponível com URL, chave e segredo de webhook configurados", () => {
  assert.match(evolutionDb, /EVOLUTION_API_URL/);
  assert.match(evolutionDb, /EVOLUTION_API_KEY/);
  assert.match(evolutionDb, /EVOLUTION_WEBHOOK_SECRET/);
  assert.match(evolutionDb, /missing\.length === 0/);
  assert.match(envExample, /EVOLUTION_API_URL=/);
  assert.match(envExample, /EVOLUTION_API_KEY=/);
  assert.match(envExample, /EVOLUTION_WEBHOOK_SECRET=/);
});

test("chave global da Evolution nunca é enviada para o navegador", () => {
  assert.doesNotMatch(ui, /EVOLUTION_API_KEY/);
  assert.doesNotMatch(connectRoute, /apiKey:/);
  assert.match(evolutionDb, /apiKey: String\(process\.env\.EVOLUTION_API_KEY/);
  assert.match(evolutionDb, /apikey: config\.apiKey/);
});

test("cada barbearia recebe uma instância própria e conexão por QR Code", () => {
  assert.match(evolutionDb, /`cortou-anotou-\$\{organizationId\}`/);
  assert.match(evolutionDb, /\/instance\/create/);
  assert.match(evolutionDb, /integration: "WHATSAPP-BAILEYS"/);
  assert.match(evolutionDb, /qrcode: true/);
  assert.match(evolutionDb, /\/instance\/connect\//);
  assert.match(ui, /QR Code do WhatsApp/);
  assert.match(ui, /Aparelhos conectados/);
});

test("servidor consulta estado da sessão e a interface acompanha até conectar", () => {
  assert.match(evolutionDb, /\/instance\/connectionState\//);
  assert.match(connectRoute, /refreshEvolutionConnection/);
  assert.match(ui, /window\.setInterval/);
  assert.match(ui, /data\.connection\.status !== "connecting"/);
});

test("webhook Evolution é autenticado por segredo e não confia em payload público", () => {
  assert.match(evolutionDb, /x-ca-evolution-secret/);
  assert.match(evolutionDb, /validEvolutionWebhookSecret/);
  assert.match(webhookRoute, /x-ca-evolution-secret/);
  assert.match(webhookRoute, /validEvolutionWebhookSecret/);
  assert.match(webhookRoute, /Webhook Evolution não autorizado/);
});

test("instância assina eventos necessários para conexão e mensagens", () => {
  assert.match(evolutionDb, /MESSAGES_UPSERT/);
  assert.match(evolutionDb, /MESSAGES_UPDATE/);
  assert.match(evolutionDb, /CONNECTION_UPDATE/);
  assert.match(evolutionDb, /\/webhook\/set\//);
});

test("envio de texto usa a instância da própria barbearia", () => {
  assert.match(evolutionDb, /\/message\/sendText\//);
  assert.match(evolutionDb, /number: phone/);
  assert.match(evolutionDb, /eq\(whatsappConnections\.organizationId, whatsappMessages\.organizationId\)/);
  assert.match(evolutionDb, /eq\(whatsappConnections\.provider, EVOLUTION_PROVIDER\)/);
});

test("mensagens recebidas ignoram grupos, broadcast e mensagens do próprio número", () => {
  assert.match(evolutionDb, /Boolean\(key\.fromMe\)/);
  assert.match(evolutionDb, /jid\.includes\("@g\.us"\)/);
  assert.match(evolutionDb, /jid\.includes\("@broadcast"\)/);
  assert.match(evolutionDb, /handleWhatsappWebhook/);
});

test("rota de conexão exige sessão de proprietário e acesso ativo", () => {
  assert.match(connectRoute, /getSessionAccess/);
  assert.match(connectRoute, /!access\.isOwner/);
  assert.match(connectRoute, /isOrganizationAccessExpired/);
  assert.match(connectRoute, /startEvolutionConnection/);
});

test("uma conexão Meta já ativa não é substituída silenciosamente", () => {
  assert.match(evolutionDb, /current\?\.provider === "meta_cloud" && current\.status === "connected"/);
  assert.match(evolutionDb, /Desconecte a integração da Meta antes de conectar/);
});

test("desconectar Evolution encerra a sessão e pausa automações", () => {
  assert.match(evolutionDb, /\/instance\/logout\//);
  assert.match(evolutionDb, /enabled: false/);
  assert.match(settingsRoute, /disconnectEvolutionWhatsapp/);
});

test("fila periódica separa Evolution de integrações Meta legadas", () => {
  assert.match(jobsRoute, /processEvolutionWhatsappQueue/);
  assert.match(jobsRoute, /provider, "meta_cloud"/);
  assert.match(jobsRoute, /processWhatsappQueue/);
});

test("compatibilidade Meta permanece no servidor para clientes legados", () => {
  assert.match(legacyDb, /WHATSAPP_APP_SECRET/);
  assert.match(legacyDb, /graph\.facebook\.com/);
  assert.match(envExample, /WHATSAPP_APP_SECRET=/);
  assert.match(webhookRoute, /x-hub-signature-256/);
});

test("conexão manual por token continua fora da API do proprietário", () => {
  assert.doesNotMatch(settingsRoute, /connect-manual/);
  assert.doesNotMatch(settingsRoute, /accessToken/);
});
