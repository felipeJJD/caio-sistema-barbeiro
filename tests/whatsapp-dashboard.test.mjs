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

test("conexão Meta usa Embedded Signup sem expor campos técnicos ao proprietário", () => {
  assert.match(whatsappUi, /CONEXÃO OFICIAL META/);
  assert.match(whatsappUi, /Conectar meu WhatsApp atual/);
  assert.match(whatsappUi, /Conectar outro número/);
  assert.doesNotMatch(whatsappUi, /name="accessToken"/);
  assert.doesNotMatch(whatsappUi, /name="wabaId"/);
});

test("chave geral só pode ser ligada com conexão e pacote ativos", () => {
  assert.match(whatsappUi, /const canEnable = Boolean\(connected && hasPackage\)/);
  assert.match(whatsappUi, /disabled=\{!canEnable \|\| saving\}/);
});

test("C.A. Atende conversacional aparece como próxima etapa e não como função ativa", () => {
  assert.match(whatsappUi, /PRÓXIMA ETAPA/);
  assert.match(whatsappUi, /C\.A\. Atende/);
  assert.match(whatsappUi, /EM PREPARAÇÃO/);
});

test("painel possui ajustes responsivos específicos para iPhone/mobile", () => {
  assert.match(stylesheet, /C\.A\. Atende — painel de WhatsApp do proprietário/);
  assert.match(stylesheet, /@media\(max-width:680px\)\{\.whatsapp-page/);
  assert.match(stylesheet, /\.whatsapp-rule\.reminder select\{width:100%;font-size:16px\}/);
});
