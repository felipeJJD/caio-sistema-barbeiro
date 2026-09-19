import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamClosurePdf } from "../lib/team-closure-pdf.ts";

test("gera PDF de fechamento com cabeçalho válido", () => {
  const pdf = buildTeamClosurePdf({
    version: 1,
    organizationName: "Barbearia Teste",
    teamMember: { id: 2, name: "Davi", role: "Barbeiro" },
    periodStartDate: "2026-09-10",
    periodEndDate: "2026-10-15",
    closedAt: "2026-10-15T18:00:00.000Z",
    paymentDay: 15,
    totals: {
      earnedCents: 42000,
      tipCents: 2500,
      valeCents: 5000,
      paidCents: 3000,
      settlementCents: 34000,
      recordCount: 2,
    },
    records: [
      { id: 1, occurredAt: "2026-10-14", clientName: "Cliente Um", serviceName: "Corte", recordType: "Avulso", commissionCents: 1500, tipCents: 500, payoutCents: 2000 },
      { id: 2, occurredAt: "2026-10-15", clientName: "Cliente Dois", serviceName: "Corte + barba", recordType: "Avulso", commissionCents: 2500, tipCents: 2000, payoutCents: 4500 },
    ],
    productSales: [],
    entries: [
      { id: 4, teamMemberId: 2, teamMemberName: "Davi", occurredAt: "2026-10-01", kind: "Vale", reason: "Adiantamento", valueCents: 5000 },
      { id: 5, teamMemberId: 2, teamMemberName: "Davi", occurredAt: "2026-10-10", kind: "Pagamento", reason: "Parcial", valueCents: 3000 },
    ],
  });
  const bytes = Buffer.from(pdf);
  assert.equal(bytes.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.ok(bytes.length > 1000);
  assert.match(bytes.toString("latin1"), /Obrigado pelo seu trabalho e dedicação/);
});
