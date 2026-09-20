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

const helper = await load("../lib/ca-atende.ts");
const [botDb, whatsappDb, webhookRoute, ui, migration] = await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0045_ca_atende_economy.sql", import.meta.url), "utf8"),
]);

test("cumprimentos simples usam regra barata antes de qualquer IA", () => {
  assert.equal(helper.classifyCaAtendeByRule("Oi tudo bem").intent, "greeting");
  assert.equal(helper.classifyCaAtendeByRule("Boa tarde").intent, "greeting");
});

test("pedidos de humano são identificados diretamente", () => {
  assert.equal(helper.classifyCaAtendeByRule("quero falar com o proprietário").intent, "human");
  assert.equal(helper.classifyCaAtendeByRule("posso conversar com uma pessoa?").intent, "human");
});

test("preço, disponibilidade, cancelamento e remarcação têm rotas determinísticas", () => {
  assert.equal(helper.classifyCaAtendeByRule("quanto custa corte e barba?").intent, "prices");
  assert.equal(helper.classifyCaAtendeByRule("tem horário hoje?").intent, "availability");
  assert.equal(helper.classifyCaAtendeByRule("quero cancelar meu horário").intent, "cancel");
  assert.equal(helper.classifyCaAtendeByRule("quero trocar meu horário").intent, "reschedule");
});

test("filtro comercial só silencia oferta com alta confiança", () => {
  assert.equal(helper.highConfidenceCommercialOffer("Olá sou consultor da Vivo e tenho uma oferta comercial para sua empresa"), true);
  assert.equal(helper.highConfidenceCommercialOffer("vocês tem internet para cliente?"), false);
  assert.equal(helper.classifyCaAtendeByRule("sou representante da Claro com plano empresarial").intent, "spam");
});

test("datas hoje, amanhã e formato brasileiro são entendidas sem IA", () => {
  assert.equal(helper.extractCaAtendeDate("hoje", "2026-09-20"), "2026-09-20");
  assert.equal(helper.extractCaAtendeDate("amanhã", "2026-09-20"), "2026-09-21");
  assert.equal(helper.extractCaAtendeDate("dia 25/09", "2026-09-20"), "2026-09-25");
});

test("IA é fallback e nunca a primeira etapa para mensagens simples", () => {
  assert.match(botDb, /classifyCaAtendeByRule\(message\)/);
  assert.match(botDb, /interpretation\.intent === "unknown" && context\.settings\.aiFallbackEnabled/);
  assert.match(botDb, /interpretCaAtendeWithAi/);
});

test("saudação padrão manda uma única mensagem com nome e link da barbearia", () => {
  assert.match(botDb, /Seja bem-vindo à/);
  assert.match(botDb, /Para marcar seu horário é bem rapidinho/);
  assert.match(botDb, /Se preferir atendimento por aqui/);
  assert.match(botDb, /bookingLink\(context\.organization\.slug\)/);
});

test("consulta de horário usa a agenda real do Cortou Anotou", () => {
  assert.match(botDb, /getPublicBookingSlots/);
  assert.match(botDb, /selectedService\.id/);
  assert.match(botDb, /selectedBarber\?\.id/);
  assert.match(botDb, /Para garantir o horário, escolha e confirme pelo link/);
});

test("preços vêm dos serviços reais e são agrupados em uma resposta", () => {
  assert.match(botDb, /formatCaAtendeMoney\(item\.priceCents\)/);
  assert.match(botDb, /context\.services\.slice\(0,8\)/);
  assert.match(botDb, /Agendamento:/);
});

test("oferta comercial é marcada mas não recebe resposta", () => {
  assert.match(botDb, /decision\.spam/);
  assert.match(botDb, /suspectedOfferAt:now/);
  assert.match(botDb, /replied:false, reason:"suspected_offer"/);
});

test("handoff humano envia uma despedida curta, notifica dono e pausa até encerramento", () => {
  assert.match(botDb, /defaultHandoff/);
  assert.match(botDb, /indefiniteHandoff:Boolean\(decision\.handoff\)/);
  assert.match(botDb, /notifyOwnersOfWhatsappHandoff/);
  assert.match(whatsappDb, /pauseReason === "human_takeover" && !conversation\.automationPausedUntil/);
  assert.match(ui, /Encerrar atendimento/);
});

test("resposta de bot é texto de sessão e tem deduplicação por mensagem recebida", () => {
  assert.match(whatsappDb, /kind: "bot_text"/);
  assert.match(whatsappDb, /dedupeKey: `bot:\$\{input\.inboundProviderMessageId\}`/);
  assert.match(whatsappDb, /type: "text"/);
  assert.match(whatsappDb, /preview_url: false/);
});

test("fila reivindica mensagem antes da chamada externa para reduzir envio duplicado", () => {
  assert.match(whatsappDb, /status: "sending"/);
  assert.match(whatsappDb, /returning\(\{ id: whatsappMessages\.id \}\)/);
  assert.match(whatsappDb, /eq\(whatsappMessages\.status, "sending"\)/);
});

test("webhook responde à Meta antes de iniciar interpretação mais lenta", () => {
  assert.match(webhookRoute, /import \{ after \} from "next\/server"/);
  assert.match(webhookRoute, /after\(async \(\) =>/);
  assert.match(webhookRoute, /processCaAtendeInboundSafely/);
});

test("modo econômico nasce ativo nas configurações, mas bot continua desligado por padrão", () => {
  assert.match(migration, /economy_mode.*DEFAULT 1 NOT NULL/);
  assert.match(migration, /booking_link_first.*DEFAULT 1 NOT NULL/);
  assert.match(migration, /spam_filter_enabled.*DEFAULT 1 NOT NULL/);
  assert.match(whatsappDb, /botEnabled: false/);
});

test("estado curto da conversa é persistido sem depender de histórico inteiro na IA", () => {
  assert.match(migration, /bot_state/);
  assert.match(migration, /bot_context_json/);
  assert.match(migration, /last_intent/);
  assert.match(botDb, /Contexto curto da conversa|botContextJson/);
});
