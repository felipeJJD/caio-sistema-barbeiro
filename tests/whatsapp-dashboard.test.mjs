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

test("aba mostra conexão, link de agendamento e automações sem pacotes", () => {
  assert.match(whatsappUi, /C\.A\. ATENDE · WHATSAPP/);
  assert.match(whatsappUi, /WhatsApp conectado/);
  assert.match(whatsappUi, /Link para clientes agendarem/);
  assert.doesNotMatch(whatsappUi, /PACOTE DE MENSAGENS/);
  assert.match(whatsappUi, /Confirmação do agendamento/);
  assert.match(whatsappUi, /Lembrete antes do horário/);
  assert.match(whatsappUi, /Aviso de cancelamento/);
  assert.match(whatsappUi, /Aviso de remarcação/);
});

test("conexão Evolution acontece dentro do próprio menu sem campos técnicos", () => {
  assert.match(whatsappUi, /CONECTAR WHATSAPP/);
  assert.match(whatsappUi, /Gerar código/);
  assert.match(whatsappUi, /\/api\/whatsapp\/evolution/);
  assert.match(whatsappUi, /Seu código de conexão/);
  assert.doesNotMatch(whatsappUi, /CONEXÃO OFICIAL META/);
  assert.doesNotMatch(whatsappUi, /connect\.facebook\.net/);
  assert.doesNotMatch(whatsappUi, /name="accessToken"/);
  assert.doesNotMatch(whatsappUi, /name="wabaId"/);
});

test("laboratório antigo não aparece na experiência do cliente", () => {
  assert.doesNotMatch(whatsappUi, /Testar atendente/);
  assert.doesNotMatch(whatsappUi, /LABORATÓRIO DO C\.A\. ATENDE/);
  assert.doesNotMatch(whatsappUi, /\/api\/whatsapp\/test/);
});

test("chave geral exige conexão e direito de uso do WhatsApp", () => {
  assert.match(whatsappUi, /const hasMessageAccess = Boolean\(data\?\.entitlement\.hasAccess\)/);
  assert.doesNotMatch(whatsappUi, /const hasPackage/);
  assert.match(whatsappUi, /const canEnable = Boolean\(connected && hasMessageAccess\)/);
  assert.match(whatsappUi, /disabled=\{!canEnable \|\| saving\}/);
});

test("C.A. Atende só liga com conexão, direito de uso e automações", () => {
  assert.match(whatsappUi, /Atendimento inteligente por IA/);
  assert.match(whatsappUi, /checked=\{data\.settings\.botEnabled\}/);
  assert.match(whatsappUi, /!hasMessageAccess \? "Renove a assinatura"/);
  assert.match(whatsappUi, /disabled=\{!canEnable \|\| !data\.settings\.enabled \|\| saving\}/);
});

test("fila humana mantém o bot em silêncio até o proprietário encerrar", () => {
  assert.match(whatsappUi, /Clientes esperando uma pessoa/);
  assert.match(whatsappUi, /O bot fica em silêncio/);
  assert.match(whatsappUi, /resume-conversation/);
  assert.match(whatsappUi, /Encerrar atendimento/);
});

test("painel possui ajustes responsivos específicos para iPhone/mobile", () => {
  assert.match(stylesheet, /C\.A\. Atende — painel de WhatsApp do proprietário/);
  assert.match(stylesheet, /@media\(max-width:680px\)\{\.whatsapp-page/);
  assert.match(stylesheet, /\.whatsapp-rule\.reminder select\{width:100%;font-size:16px\}/);
});
