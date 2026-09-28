import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, whatsappUi, stylesheet] = await Promise.all([
  readFile(new URL("../app/ui/dashboard-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("proprietário possui área WhatsApp na navegação e no roteamento interno", () => {
  assert.match(dashboard, /label: "WhatsApp", section: "WhatsApp"/);
  assert.match(dashboard, /activeSection === "WhatsApp"/);
  assert.match(dashboard, /<WhatsappAutomation/);
  assert.match(dashboard, /"Equipe", "Usuários", "WhatsApp"/);
});

test("aba mostra conexão, pacote, uso mensal e automações", () => {
  assert.match(whatsappUi, /C\.A\. ATENDE · WHATSAPP/);
  assert.match(whatsappUi, /PACOTE DE MENSAGENS/);
  assert.match(whatsappUi, /USO NESTE MÊS/);
  assert.match(whatsappUi, /Confirmação do agendamento/);
  assert.match(whatsappUi, /Lembrete antes do horário/);
  assert.match(whatsappUi, /Aviso de cancelamento/);
  assert.match(whatsappUi, /Aviso de remarcação/);
});

test("conexão Evolution usa QR Code sem expor credenciais técnicas ao proprietário", () => {
  assert.match(whatsappUi, /CONEXÃO POR EVOLUTION API/);
  assert.match(whatsappUi, /Conectar meu WhatsApp/);
  assert.match(whatsappUi, /QR Code do WhatsApp/);
  assert.match(whatsappUi, /Aparelhos conectados/);
  assert.match(whatsappUi, /connectEvolution/);
  assert.doesNotMatch(whatsappUi, /EVOLUTION_API_KEY/);
  assert.doesNotMatch(whatsappUi, /name="accessToken"/);
  assert.doesNotMatch(whatsappUi, /name="wabaId"/);
});

test("tela acompanha automaticamente a leitura do QR Code", () => {
  assert.match(whatsappUi, /data\.connection\.status !== "connecting"/);
  assert.match(whatsappUi, /window\.setInterval\(\(\) => void load\(undefined, true\), 3000\)/);
  assert.match(whatsappUi, /setQr\(null\)/);
});

test("chave geral só pode ser ligada com conexão e pacote ativos", () => {
  assert.match(whatsappUi, /const canEnable = Boolean\(connected && hasPackage\)/);
  assert.match(whatsappUi, /disabled=\{!canEnable \|\| saving\}/);
});

test("C.A. Atende aparece como IA principal e só liga com conexão, pacote e automações", () => {
  assert.match(whatsappUi, /Atendimento inteligente por IA/);
  assert.match(whatsappUi, /AGENDA REAL/);
  assert.match(whatsappUi, /FILTRO DE OFERTAS/);
  assert.match(whatsappUi, /TRANSFERÊNCIA HUMANA/);
  assert.match(whatsappUi, /checked=\{data\.settings\.botEnabled\}/);
  assert.match(whatsappUi, /disabled=\{!canEnable \|\| !data\.settings\.enabled \|\| saving\}/);
});

test("fila humana mantém o bot em silêncio até o proprietário liberar a automação", () => {
  assert.match(whatsappUi, /Clientes esperando uma pessoa/);
  assert.match(whatsappUi, /O bot fica em silêncio/);
  assert.match(whatsappUi, /resume-conversation/);
  assert.match(whatsappUi, /Liberar automação/);
});

test("painel possui ajustes responsivos específicos para iPhone/mobile", () => {
  assert.match(stylesheet, /C\.A\. Atende — painel de WhatsApp do proprietário/);
  assert.match(stylesheet, /@media\(max-width:680px\)\{\.whatsapp-page/);
  assert.match(stylesheet, /\.whatsapp-rule\.reminder select\{width:100%;font-size:16px\}/);
});
