import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const component = await readFile(new URL("../app/ui/public-product-slider.tsx", import.meta.url), "utf8");
const screenshots = [
  ["painel", "painel.webp"],
  ["agenda", "agenda.webp"],
  ["registrar", "registrar-v2.webp"],
  ["historico", "historico.webp"],
  ["whatsapp", "whatsapp.webp"],
  ["menu", "menu.webp"],
];

test("página pública usa capturas reais do C.A. em vez dos mockups gerados", async () => {
  assert.doesNotMatch(component, /public-real-screens/);
  assert.match(component, /TELAS REAIS DO C\|A/);

  for (const [, filename] of screenshots) {
    assert.match(component, new RegExp(`/landing/real/${filename.replace(".", "\\.")}`));
    await access(new URL(`../public/landing/real/${filename}`, import.meta.url));
  }
});

test("carrossel público inclui WhatsApp e menu lateral e mantém descrição acessível", () => {
  assert.match(component, /label: "WhatsApp"/);
  assert.match(component, /label: "Menu lateral"/);
  assert.match(component, /Capturas reais do aplicativo Cortou Anotou/);
  assert.match(component, /Tela real do Cortou Anotou/);
});
