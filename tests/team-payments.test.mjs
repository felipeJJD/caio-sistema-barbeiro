import assert from "node:assert/strict";
import test from "node:test";
import { isTeamPaymentKind, teamPaymentSummary } from "../lib/team-payments.ts";

test("aceita somente Vale e Pagamento na movimentação da equipe", () => {
  assert.equal(isTeamPaymentKind("Vale"), true);
  assert.equal(isTeamPaymentKind("Pagamento"), true);
  assert.equal(isTeamPaymentKind("Despesa"), false);
});

test("vale e pagamento reduzem o saldo uma única vez", () => {
  assert.deepEqual(teamPaymentSummary(20_000, [
    { kind: "Vale", valueCents: 3_000 },
    { kind: "Pagamento", valueCents: 5_000 },
  ]), {
    earnedCents: 20_000,
    valeCents: 3_000,
    paidCents: 5_000,
    deliveredCents: 8_000,
    remainingCents: 12_000,
  });
});

test("mantém visível quando houve adiantamento maior que a comissão", () => {
  assert.equal(teamPaymentSummary(4_000, [{ kind: "Vale", valueCents: 5_000 }]).remainingCents, -1_000);
});
