import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("app/ui/business-insights.tsx", "utf8");
const db = readFileSync("db/business-insights.ts", "utf8");

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

test("client radar excludes monthly membership attendances without changing other business insights", () => {
  assert.match(db, /membershipClientId: dailyRecords\.membershipClientId/);
  assert.match(db, /recordType: dailyRecords\.recordType/);
  assert.match(db, /origin: dailyRecords\.origin/);
  assert.match(db, /row\.membershipClientId !== null/);
  assert.match(db, /marker\.includes\("mensal"\)/);
  assert.match(db, /marker\.includes\("assinatura"\)/);
  assert.match(db, /radarAttendances/);
  assert.match(db, /buildClientFrequency\(\{ attendances: radarAttendances/);
  assert.match(db, /buildDormantClients\(\{\s*attendances,/s);
  assert.match(db, /buildFinanceMonths\(\{\s*attendances,/s);
});
