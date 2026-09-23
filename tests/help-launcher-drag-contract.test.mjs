import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guard = readFileSync(new URL("../app/ui/help-launcher-drag-guard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/help-launcher-drag.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("Central de Ajuda mantém clique normal e diferencia arraste por distância", () => {
  assert.match(guard, /DRAG_THRESHOLD = 6/);
  assert.match(guard, /Math\.hypot\(event\.clientX - startX, event\.clientY - startY\)/);
  assert.match(guard, /if \(!moved && distance < DRAG_THRESHOLD\) return/);
  assert.match(guard, /event\.stopImmediatePropagation\(\)/);
});

test("botão de ajuda gruda na lateral e memoriza posição", () => {
  assert.match(guard, /cortou-anotou:help-launcher-position:v1/);
  assert.match(guard, /side: "left" \| "right"/);
  assert.match(guard, /window\.localStorage\.setItem\(STORAGE_KEY/);
  assert.match(guard, /center < viewportLeft \+ viewportWidth \/ 2 \? "left" : "right"/);
});

test("posição respeita viewport móvel, teclado e navegação inferior", () => {
  assert.match(guard, /window\.visualViewport/);
  assert.match(guard, /\.mobile-bottom-navigation/);
  assert.match(guard, /navigationTop - height - EDGE_MARGIN/);
  assert.match(guard, /window\.visualViewport\?\.addEventListener\("resize", syncPosition\)/);
});

test("botão fica pequeno e circular no celular", () => {
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /width: 54px !important/);
  assert.match(css, /height: 54px !important/);
  assert.match(css, /border-radius: 50% !important/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /\.help-launcher > strong/);
});

test("guard e CSS são carregados globalmente sem alterar o assistente", () => {
  assert.match(layout, /import "\.\/help-launcher-drag\.css"/);
  assert.match(layout, /import \{ HelpLauncherDragGuard \} from "\.\/ui\/help-launcher-drag-guard"/);
  assert.match(layout, /<HelpLauncherDragGuard \/>/);
});
