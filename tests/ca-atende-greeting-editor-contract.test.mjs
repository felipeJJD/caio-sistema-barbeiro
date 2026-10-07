import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, smart, settingsRoute] = await Promise.all([
  readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/whatsapp/settings/route.ts", import.meta.url), "utf8"),
]);

test("proprietário consegue editar e restaurar a saudação pelo painel do WhatsApp", () => {
  assert.match(ui, /Editar saudação/);
  assert.match(ui, /MENSAGEM DE BOAS-VINDAS/);
  assert.match(ui, /Salvar saudação/);
  assert.match(ui, /Restaurar padrão/);
  assert.match(ui, /greetingText: greetingDraft/);
  assert.match(ui, /\{barbearia\}/);
  assert.match(ui, /\{link\}/);
});

test("saudação personalizada preserva o texto e garante link e escolhas padrão", () => {
  const greetingStart = smart.indexOf("function greetingText");
  const greetingEnd = smart.indexOf("function handoffText", greetingStart);
  const greeting = smart.slice(greetingStart, greetingEnd);
  assert.match(greeting, /custom\.trim\(\)/);
  assert.match(greeting, /replaceAll\("\{barbearia\}"/);
  assert.match(greeting, /replaceAll\("\{link\}"/);
  assert.match(greeting, /if \(!intro\.includes\(link\)\)/);
  assert.match(greeting, /Para agendar seu horário, use nosso link/);
  assert.match(greeting, /1️⃣ Continuar por aqui/);
  assert.match(greeting, /2️⃣ Falar com alguém da barbearia/);
});

test("API existente continua salvando greetingText somente pela área autenticada", () => {
  assert.match(settingsRoute, /getSessionAccess/);
  assert.match(settingsRoute, /Somente o proprietário pode configurar o WhatsApp/);
  assert.match(settingsRoute, /greetingText: typeof data\.greetingText === "string"/);
});
