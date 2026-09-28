import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, page, css, layout] = await Promise.all([
  readFile(new URL("../app/ui/public-product-slider.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/comece/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/public-product-slider.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
]);

test("landing apresenta sete áreas do aplicativo em um slider lateral", () => {
  const keys = [...component.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ["painel", "agenda", "registro", "historico", "mensalistas", "financeiro", "whatsapp"]);
  assert.match(page, /<PublicProductSlider \/>/);
  assert.match(component, /Arraste para o lado/);
  assert.match(css, /scroll-snap-type:x mandatory/);
});

test("prévia pública usa dados demonstrativos e não expõe a equipe real", () => {
  assert.match(component, /dados demonstrativos/i);
  assert.doesNotMatch(component, /Davi|Eduardo|Kaio/);
});

test("slider é carregado globalmente e respeita movimento reduzido", () => {
  assert.match(layout, /public-product-slider\.css/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(component, /setInterval|autoplay/i);
});
