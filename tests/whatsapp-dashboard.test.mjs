import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, whatsappUi] = await Promise.all([
  readFile(new URL("../app/ui/dashboard-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
]);

test("proprietário possui área WhatsApp na navegação e no roteamento interno", () => {
  assert.match(dashboard, /label: "WhatsApp", section: "WhatsApp"/);
  assert.match(dashboard, /activeSection === "WhatsApp"/);
  assert.match(dashboard, /<WhatsappAutomation/);
  assert.match(dashboard, /"Equipe", "Usuários", "WhatsApp"/);
});

test("aba mostra conexão, link de agendamento e automações sem pacotes", () => {
  assert.match(whatsappUi, /WhatsApp conectado/);
  assert.match(whatsappUi, /Link para agendamento/);
  assert.doesNotMatch(whatsappUi, /PACOTE DE MENSAGENS/);
  assert.match(whatsappUi, /Confirmação do agendamento/);
  assert.match(whatsappUi, /Lembrete do horário/);
  assert.match(whatsappUi, /Aviso de cancelamento/);
  assert.match(whatsappUi, /Aviso de remarcação/);
});

test("painel conectado é realmente compacto e não repete cartões de apresentação", () => {
  assert.doesNotMatch(whatsappUi, /whatsapp-hero panel/);
  assert.doesNotMatch(whatsappUi, /Gerencie seu atendimento automático\./);
  assert.match(whatsappUi, /wa2-status/);
  assert.match(whatsappUi, /wa2-list/);
  assert.match(whatsappUi, /wa2-ai/);
  assert.match(whatsappUi, /data\.settings\.reminderEnabled && <select/);
});

test("painel principal evita explicações e ações raras em excesso", () => {
  assert.doesNotMatch(whatsappUi, /O que o Cortou Anotou pode enviar sozinho/);
  assert.doesNotMatch(whatsappUi, />Salvar<\/button>/);
  assert.match(whatsappUi, /Configurações avançadas/);
  assert.match(whatsappUi, /<details className="panel whatsapp-advanced-settings wa2-advanced"/);
  assert.match(whatsappUi, /Lembrete atualizado\./);
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
  assert.match(whatsappUi, /Atendimento por IA/);
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

test("painel compacto mantém ajustes específicos para iPhone", () => {
  assert.match(whatsappUi, /@media\(max-width:680px\)/);
  assert.match(whatsappUi, /\.wa2-reminder select\{min-height:36px;max-width:136px/);
  assert.match(whatsappUi, /font-size:16px/);
});
