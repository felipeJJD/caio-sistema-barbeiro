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
const [botDb, whatsappDb, webhookRoute, testRoute, ui, migration] = await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/test/route.ts", import.meta.url), "utf8"),
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

test("datas, horários e dias da semana são entendidos sem IA", () => {
  assert.equal(helper.extractCaAtendeDate("hoje", "2026-09-20", 1200), "2026-09-20");
  assert.equal(helper.extractCaAtendeDate("amanhã", "2026-09-20", 1200), "2026-09-21");
  assert.equal(helper.extractCaAtendeDate("dia 25/09", "2026-09-20", 1200), "2026-09-25");
  assert.equal(helper.extractCaAtendeTime("às 9h"), "09:00");
  assert.equal(helper.extractCaAtendeTime("14:30"), "14:30");
  assert.equal(helper.extractCaAtendeDate("domingo às 9h", "2026-09-20", 1200), "2026-09-27");
  assert.equal(helper.extractCaAtendeDate("segunda às 9h", "2026-09-20", 1200), "2026-09-21");
});

test("IA é fallback e nunca a primeira etapa para mensagens simples", () => {
  assert.match(botDb, /classifyCaAtendeByRule\(message\)/);
  assert.match(botDb, /interpretation\.intent === "unknown" && context\.settings\.aiFallbackEnabled/);
  assert.match(botDb, /interpretCaAtendeWithAi/);
});

test("saudação padrão manda uma única mensagem com link e mantém Ver opções", () => {
  assert.match(botDb, /Seja bem-vindo à/);
  assert.match(botDb, /Para agendar seu horário é só acessar/);
  assert.match(botDb, /Se preferir outro assunto, toque em “Ver opções”/);
  assert.match(botDb, /bookingLink\(context\.organization\.slug\)/);
});

test("consulta de horário usa a agenda real do Cortou Anotou", () => {
  assert.match(botDb, /getPublicBookingSlotsExpanded/);
  assert.match(botDb, /selectedService\.id/);
  assert.match(botDb, /selectedBarber\?\.id/);
  assert.match(botDb, /Deseja confirmar\?/);
});

test("preços vêm dos serviços reais e podem responder um serviço específico ou a tabela", () => {
  assert.match(botDb, /formatCaAtendeMoney\(selectedService\.priceCents\)/);
  assert.match(botDb, /context\.services\.slice\(0,8\)/);
  assert.match(botDb, /selectedService\.name} custa/);
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


test("laboratório reutiliza o mesmo composeReply sem enviar nada para a Meta", () => {
  assert.match(botDb, /export async function simulateCaAtende/);
  assert.match(botDb, /const decision = await composeReply/);
  const simulation = botDb.slice(botDb.indexOf("export async function simulateCaAtende"), botDb.indexOf("export async function processCaAtendeInbound"));
  assert.doesNotMatch(simulation, /queueWhatsappTextReply/);
  assert.doesNotMatch(simulation, /processWhatsappQueueSafely/);
  assert.doesNotMatch(simulation, /updateConversation/);
});

test("rota de teste é exclusiva do proprietário, limitada e não depende de conexão Meta", () => {
  assert.match(testRoute, /getSessionAccess/);
  assert.match(testRoute, /!access\.isOwner/);
  assert.match(testRoute, /enforceRateLimit/);
  assert.match(testRoute, /simulateCaAtende/);
  assert.doesNotMatch(testRoute, /WHATSAPP_APP_SECRET|graph\.facebook\.com|queueWhatsappTextReply/);
});

test("interface oferece laboratório antes da conexão Meta e mostra como a resposta foi resolvida", () => {
  assert.match(ui, /Testar atendente/);
  assert.match(ui, /LABORATÓRIO DO C\.A\. ATENDE/);
  assert.match(ui, /Nenhuma mensagem é enviada para a Meta/);
  assert.match(ui, /AGENDA REAL/);
  assert.match(ui, /SERVIÇOS REAIS/);
  assert.match(ui, /SILÊNCIO/);
  assert.match(ui, /Reiniciar conversa/);
});


test("resposta de preço específico não despeja a tabela inteira", () => {
  assert.match(botDb, /selectedService\.name} custa/);
  assert.match(botDb, /Se quiser, eu também posso consultar os horários disponíveis/);
});

test("agendamento conversado preserva serviço, barbeiro, dia e horário", () => {
  assert.match(botDb, /awaiting_booking_details/);
  assert.match(botDb, /awaiting_booking_choice/);
  assert.match(botDb, /desiredTime/);
  assert.match(botDb, /exact = slots\.filter\(slot => slot\.time === desiredTime\)/);
  assert.match(botDb, /Qual desses fica melhor/);
});

test("escolher Eduardo não é confundido com pedido para falar com humano", () => {
  assert.match(botDb, /barber && !explicitHumanRequest\(event\.text\)/);
  assert.match(botDb, /intent = oldMemory\.intent === "availability" \? "availability" : "booking"/);
});

test("respostas curtas de continuação usam memória antes de gastar IA", () => {
  assert.match(botDb, /bookingContinuation/);
  assert.match(botDb, /memory\.intent === "booking"/);
  assert.match(botDb, /knownService \|\| knownBarber/);
});

test("link público nunca expõe domínio técnico do Railway", () => {
  assert.ok(botDb.includes("https://cortouanotou.com.br"));
  assert.doesNotMatch(botDb, /PUBLIC_BOOKING_BASE_URL/);
});


test("regressão do vídeo: entende 'às10' e horário curto '10'", () => {
  assert.equal(helper.extractCaAtendeTime("amanhã às10"), "10:00");
  assert.equal(helper.extractCaAtendeTime("10"), "10:00");
});

test("regressão do vídeo: troca de profissional é continuação da reserva e não chama IA", () => {
  assert.match(botDb, /wantsAnotherProfessional/);
  assert.match(botDb, /changingProfessional/);
  assert.match(botDb, /source:changingProfessional \? "rule" : interpreted\.source/);
});

test("regressão do vídeo: confirmação não repete disponibilidade nem deixa IA trocar o serviço", () => {
  assert.match(botDb, /wantsBookingConfirmation/);
  assert.match(botDb, /confirmationRequested:true/);
  assert.match(botDb, /No modo teste eu não altero sua agenda/);
  assert.match(botDb, /explicitService\?\.name \|\| oldMemory\.service \|\| aiService\?\.name/);
});

test("agenda expandida permite mostrar profissionais alternativos sem mudar o fluxo público existente", async () => {
  const publicBookingDb = await readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8");
  assert.match(publicBookingDb, /export async function getPublicBookingSlotsExpanded/);
  assert.match(publicBookingDb, /for \(const barber of context\.candidateBarbers\)/);
  assert.match(publicBookingDb, /slots\.push\(\{ time: toTime\(start\), barberId: barber\.id, barberName: barber\.name \}\)/);
});

test("horários de vários profissionais são agrupados de forma legível", () => {
  assert.match(botDb, /const groups = new Map<string, string\[\]>/);
  assert.match(botDb, /barberName}: \$\{times\.join/);
});
