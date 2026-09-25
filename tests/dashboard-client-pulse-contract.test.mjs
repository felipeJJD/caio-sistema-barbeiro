import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/ui/dashboard-app.tsx", import.meta.url), "utf8");

test("painel termina nos clientes parados sem o ranking antigo da equipe", () => {
  assert.match(dashboard, /<ClientPulse \/>/);
  assert.doesNotMatch(dashboard, /Equipe no período/);
  assert.doesNotMatch(dashboard, /const teamRanking =/);
});
