import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { buildHistoryWorkbook } from "../lib/history-xlsx.ts";

test("gera Excel real com resumo e uma guia por barbeiro", () => {
  const workbook = buildHistoryWorkbook({
    organizationName: "Kaio Barbearia",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-26",
    professionalLabel: "Todos os profissionais",
    professionalOrder: ["Davi", "Kaio"],
    rows: [
      { occurredAt: "2026-08-26", time: "", kind: "attendance", type: "Avulso", clientName: "João", professionalName: "Davi", description: "Corte", quantity: 1, paymentLabel: "Pix", paymentGroupName: "Pix", serviceCents: 4000, tipCents: 6000, productCents: 0, totalCents: 10000, payoutCents: 8000, detail: "Retorno" },
      { occurredAt: "2026-08-26", time: "", kind: "product", type: "Produto", clientName: "João", professionalName: "Davi", description: "Pomada", quantity: 1, paymentLabel: "Pix", paymentGroupName: "Pix", serviceCents: 0, tipCents: 0, productCents: 3000, totalCents: 3000, payoutCents: 300, detail: "Venda com atendimento" },
      { occurredAt: "2026-08-25", time: "14:30", kind: "appointment", type: "Agendamento", clientName: "Pedro", professionalName: "Kaio", description: "Corte + barba", quantity: 1, paymentLabel: "Horário concluído", paymentGroupName: "", serviceCents: 0, tipCents: 0, productCents: 0, totalCents: 0, payoutCents: 0, detail: "40 min · concluído" },
    ],
  });
  const files = unzipSync(new Uint8Array(workbook));
  const workbookXml = strFromU8(files["xl/workbook.xml"]);
  const summaryXml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const daviXml = strFromU8(files["xl/worksheets/sheet2.xml"]);
  assert.match(workbookXml, /name="Resumo"/);
  assert.match(workbookXml, /name="Davi"/);
  assert.match(workbookXml, /name="Kaio"/);
  assert.match(summaryXml, /RESULTADOS POR PROFISSIONAL/);
  assert.match(summaryXml, /Total de repasse/);
  assert.match(daviXml, /Pomada/);
  assert.match(daviXml, /SUM\(L6:L7\)/);
  assert.ok(files["xl/styles.xml"]);
  assert.ok(workbook.byteLength > 4000);
  assert.doesNotMatch(summaryXml + daviXml, /NaN|undefined/);
  if (process.env.HISTORY_XLSX_SAMPLE) writeFileSync(process.env.HISTORY_XLSX_SAMPLE, new Uint8Array(workbook));
});
