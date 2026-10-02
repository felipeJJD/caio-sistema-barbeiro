import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const [component, page, css, layout] = await Promise.all([
  readFile(new URL("../app/ui/public-product-slider.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/comece/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/public-product-slider.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
]);

test("landing mostra seis capturas reais do aplicativo no slider principal", async () => {
  const keys = [...component.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ["painel", "agenda", "registrar", "historico", "whatsapp", "menu"]);
  assert.match(component, /\/landing\/real\/painel\.webp/);
  assert.match(component, /\/landing\/real\/agenda\.webp/);
  assert.match(component, /\/landing\/real\/registrar-v2\.webp/);
  assert.match(component, /\/landing\/real\/historico\.webp/);
  assert.match(component, /\/landing\/real\/whatsapp\.webp/);
  assert.match(component, /\/landing\/real\/menu\.webp/);
  assert.doesNotMatch(component, /public-real-screens/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  await access(new URL("../public/landing/real/registrar-v2.webp", import.meta.url));
});

test("slider fica na primeira dobra e substitui o mockup antigo", () => {
  assert.equal((page.match(/<PublicProductSlider \/>/g) ?? []).length, 1);
  assert.ok(page.indexOf("<PublicProductSlider />") < page.indexOf("public-proof-strip"));
  assert.ok(page.indexOf("<PublicProductSlider />") < page.indexOf("public-signup-section"));
  assert.doesNotMatch(page, /public-product-stage/);
  assert.doesNotMatch(page, /Dados separados por barbearia/);
  assert.match(page, /public-learn-link" href="#produto"/);
});

test("slider avança sozinho em loop a cada dois segundos e retoma após interação", () => {
  assert.match(component, /ADVANCE_DELAY_MS = 2000/);
  assert.match(component, /window\.setTimeout/);
  assert.match(component, /\(active \+ 1\) % slides\.length/);
  assert.match(component, /onMouseEnter=\{\(\) => setInteracting\(true\)\}/);
  assert.match(component, /onMouseLeave=\{\(\) => setInteracting\(false\)\}/);
  assert.match(component, /onPointerDown=\{\(\) => setInteracting\(true\)\}/);
  assert.match(component, /onPointerUp=\{\(\) => setInteracting\(false\)\}/);
  assert.match(component, /onPointerCancel=\{\(\) => setInteracting\(false\)\}/);
  assert.match(component, /Passa sozinho • toque para pausar/);
  assert.doesNotMatch(component, /stopMotion/);
});

test("slider maior continua responsivo e respeita movimento reduzido", () => {
  assert.match(layout, /public-product-slider\.css/);
  assert.match(css, /public-real-device\{width:280px/);
  assert.match(css, /@media\(max-width:430px\).*public-real-device\{width:268px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(component, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.doesNotMatch(component, /setInterval/i);
  assert.doesNotMatch(component, /A barbearia inteira em uma visão|Terminou o corte\?|dados demonstrativos/i);
});
