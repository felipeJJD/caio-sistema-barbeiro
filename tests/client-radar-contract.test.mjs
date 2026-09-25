import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("app/ui/business-insights.tsx", "utf8");
const db = readFileSync("db/business-insights.ts", "utf8");

test("client list stays compact and shows only the most recurrent names", () => {
  assert.match(ui, />CLIENTES</);
  assert.match(ui, /Quem mais vem/);
  assert.match(ui, /periods\["90"\]/);
  assert.match(ui, /slice\(0, 6\)/);
  assert.doesNotMatch(ui, /Pesquisar cliente/);
  assert.doesNotMatch(ui, /Mais frequentes/);
  assert.doesNotMatch(ui, /Menos frequentes/);
  assert.doesNotMatch(ui, /periodSwitch/);
  assert.doesNotMatch(ui, /radarTabs/);
  assert.doesNotMatch(ui, /frequencyTrack/);
  assert.doesNotMatch(ui, /visitBadge/);
  assert.doesNotMatch(ui, /Retorno médio/);
  assert.doesNotMatch(ui, /Tornar VIP/);
  assert.doesNotMatch(ui, /Benefício VIP/);
  assert.doesNotMatch(ui, /Progresso para mimo/);
  assert.doesNotMatch(ui, /Bônus liberado/);
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
