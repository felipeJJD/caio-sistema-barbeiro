import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("saldo da equipe usa o mesmo ciclo de vales e fechamentos", async () => {
  const ledger = await read("db/team-money.ts");
  const dashboard = await read("app/ui/dashboard-app.tsx");

  assert.match(ledger, /currentBalanceCents = earnedCents - valeCents - paidCents/);
  assert.match(ledger, /settlementCents = cycle\.currentBalanceCents/);
  assert.match(ledger, /lastDailyRecordId: cycle\.lastDailyRecordId/);
  assert.match(ledger, /lastProductSaleId: cycle\.lastProductSaleId/);
  assert.match(ledger, /lastTeamPaymentId: cycle\.lastTeamPaymentId/);
  assert.match(dashboard, /fetch\("\/api\/team-money"/);
  assert.match(dashboard, /teamMoneyRows\.find\(\(row\) => row\.teamMemberId === memberId\)/);
  assert.match(dashboard, /PAGAR \$\{member\.name\.toUpperCase\(\)\}/);
});

test("proprietário participa do controle e fotos cadastradas são reaproveitadas", async () => {
  const ledger = await read("db/team-money.ts");
  const ui = await read("app/ui/team-money-section.tsx");

  assert.match(ledger, /listPublicGalleryImages/);
  assert.match(ledger, /photoUrl/);
  assert.doesNotMatch(ledger, /filter\(\(member\) => member\.accessRole !== "owner"\)/);
  assert.doesNotMatch(ledger, /member\.accessRole === "owner"\) throw/);
  assert.match(ui, /row\.photoUrl/);
  assert.match(ui, /CONTROLE DA EQUIPE/);
});

test("nova interface cria somente vales; fechamento encerra o período", async () => {
  const ui = await read("app/ui/team-money-section.tsx");

  assert.match(ui, /kind: "Vale"/);
  assert.match(ui, /Novo vale/);
  assert.match(ui, /Fechar período/);
  assert.match(ui, /próximo período começará zerado/);
  assert.doesNotMatch(ui, /<option>Pagamento<\/option>/);
  assert.doesNotMatch(ui, /Novo pagamento/);
});
