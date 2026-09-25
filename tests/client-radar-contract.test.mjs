import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("app/ui/business-insights.tsx", "utf8");

test("client radar stays simple and focused on frequency", () => {
  assert.match(ui, /RADAR DE CLIENTES/);
  assert.match(ui, /Pesquisar cliente/);
  assert.match(ui, /Mais frequentes/);
  assert.match(ui, /Menos frequentes/);
  assert.match(ui, /30 dias/);
  assert.match(ui, /3 meses/);
  assert.match(ui, /6 meses/);
  assert.match(ui, /12 meses/);
  assert.doesNotMatch(ui, /Tornar VIP/);
  assert.doesNotMatch(ui, /Benefício VIP/);
});
