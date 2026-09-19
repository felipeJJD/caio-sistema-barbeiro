import type { TeamClosureSnapshot } from "../db/team-money";

type Page = { commands: string[] };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 42;
const RIGHT = 553;

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR");

function pdfText(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function trimText(value: string, max = 44) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(1, max - 3))}...`;
}

function buildPage() {
  return { commands: [] } satisfies Page;
}

function setFill(page: Page, r: number, g: number, b: number) {
  page.commands.push(`${r} ${g} ${b} rg`);
}

function rect(page: Page, x: number, y: number, width: number, height: number, r: number, g: number, b: number) {
  setFill(page, r, g, b);
  page.commands.push(`${x} ${y} ${width} ${height} re f`);
}

function line(page: Page, x1: number, y1: number, x2: number, y2: number, gray = .86) {
  page.commands.push(`${gray} G 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function text(page: Page, value: string, x: number, y: number, size = 9, bold = false, gray = 0.16) {
  page.commands.push(`${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`);
}

function addHeader(page: Page, snapshot: TeamClosureSnapshot) {
  rect(page, 0, PAGE_HEIGHT - 105, PAGE_WIDTH, 105, .12, .15, .13);
  text(page, "CORTOU, ANOTOU", LEFT, PAGE_HEIGHT - 42, 16, true, .96);
  text(page, snapshot.organizationName, LEFT, PAGE_HEIGHT - 62, 10, false, .82);
  text(page, "FECHAMENTO DO FUNCIONÁRIO", LEFT, PAGE_HEIGHT - 87, 8, true, .72);
  text(page, snapshot.teamMember.name, 360, PAGE_HEIGHT - 47, 14, true, .96);
  text(page, `${date(snapshot.periodStartDate)} a ${date(snapshot.periodEndDate)}`, 360, PAGE_HEIGHT - 67, 9, false, .82);
}

function addSummary(page: Page, snapshot: TeamClosureSnapshot) {
  const y = PAGE_HEIGHT - 164;
  const boxes = [
    ["Gerado", money(snapshot.totals.earnedCents)],
    ["Vales", money(snapshot.totals.valeCents)],
    ["Pagamentos", money(snapshot.totals.paidCents)],
    ["Fechado agora", money(snapshot.totals.settlementCents)],
  ];
  boxes.forEach(([label, value], index) => {
    const x = LEFT + index * 128;
    rect(page, x, y, 118, 45, .965, .96, .93);
    text(page, label, x + 9, y + 29, 7, true, .42);
    text(page, value, x + 9, y + 12, 10, true, .16);
  });
  text(page, `${snapshot.totals.recordCount} atendimento(s) · gorjetas incluídas no saldo: ${money(snapshot.totals.tipCents)}`, LEFT, y - 18, 8, false, .42);
}

function addTableHeader(page: Page, y: number) {
  rect(page, LEFT, y - 4, RIGHT - LEFT, 22, .92, .91, .87);
  text(page, "Data", LEFT + 7, y + 3, 7, true, .28);
  text(page, "Cliente / serviço", LEFT + 60, y + 3, 7, true, .28);
  text(page, "Comissão", 405, y + 3, 7, true, .28);
  text(page, "Gorjeta", 474, y + 3, 7, true, .28);
}

function addPageFooter(page: Page, pageNumber: number, totalPages: number) {
  line(page, LEFT, 42, RIGHT, 42, .9);
  text(page, "Cortou, Anotou · comprovante gerado pelo sistema", LEFT, 25, 7, false, .5);
  text(page, `Página ${pageNumber} de ${totalPages}`, 485, 25, 7, false, .5);
}

function renderPdfObjects(pages: Page[]) {
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
    return objects.length;
  };
  const catalogId = add("");
  const pagesId = add("");
  const fontRegularId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];

  for (const page of pages) {
    const stream = Buffer.from(page.commands.join("\n"), "latin1");
    const streamId = add(Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "latin1"),
      stream,
      Buffer.from("\nendstream", "latin1"),
    ]));
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`, "latin1");

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((body, index) => {
    offsets[index + 1] = offset;
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
    chunks.push(object);
    offset += object.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}

export function buildTeamClosurePdf(snapshot: TeamClosureSnapshot) {
  const pages: Page[] = [];
  let page = buildPage();
  pages.push(page);
  addHeader(page, snapshot);
  addSummary(page, snapshot);
  let y = PAGE_HEIGHT - 218;

  const ensureSpace = (needed = 30) => {
    if (y - needed > 68) return;
    page = buildPage();
    pages.push(page);
    addHeader(page, snapshot);
    y = PAGE_HEIGHT - 138;
  };

  text(page, "ATENDIMENTOS DO PERÍODO", LEFT, y, 9, true, .2);
  y -= 27;
  addTableHeader(page, y);
  y -= 20;

  for (const record of snapshot.records) {
    ensureSpace(30);
    text(page, date(record.occurredAt), LEFT + 7, y, 7.5, false, .22);
    text(page, trimText(`${record.clientName} · ${record.serviceName}`, 50), LEFT + 60, y, 7.5, false, .22);
    text(page, money(record.commissionCents), 405, y, 7.5, false, .22);
    text(page, money(record.tipCents), 474, y, 7.5, false, .22);
    y -= 20;
    line(page, LEFT, y + 8, RIGHT, y + 8, .93);
  }
  if (!snapshot.records.length) {
    text(page, "Nenhum atendimento neste fechamento.", LEFT + 7, y, 8, false, .45);
    y -= 24;
  }

  if (snapshot.productSales.length) {
    ensureSpace(55);
    y -= 6;
    text(page, "COMISSÕES DE PRODUTOS", LEFT, y, 9, true, .2);
    y -= 22;
    for (const sale of snapshot.productSales) {
      ensureSpace(24);
      text(page, date(sale.occurredAt), LEFT + 7, y, 7.5, false, .22);
      text(page, trimText(`${sale.clientName} · ${sale.productName} x${sale.quantity}`, 58), LEFT + 60, y, 7.5, false, .22);
      text(page, money(sale.commissionCents), 474, y, 7.5, true, .22);
      y -= 19;
    }
  }

  ensureSpace(70);
  y -= 8;
  text(page, "VALES E PAGAMENTOS DO PERÍODO", LEFT, y, 9, true, .2);
  y -= 22;
  if (!snapshot.entries.length) {
    text(page, "Nenhum vale ou pagamento antecipado neste período.", LEFT + 7, y, 8, false, .45);
    y -= 22;
  } else {
    for (const entry of snapshot.entries) {
      ensureSpace(24);
      text(page, date(entry.occurredAt), LEFT + 7, y, 7.5, false, .22);
      text(page, entry.kind, LEFT + 60, y, 7.5, true, .22);
      text(page, trimText(entry.reason, 50), LEFT + 130, y, 7.5, false, .22);
      text(page, money(entry.valueCents), 474, y, 7.5, true, .22);
      y -= 19;
    }
  }

  ensureSpace(90);
  y -= 10;
  rect(page, LEFT, y - 50, RIGHT - LEFT, 66, .95, .94, .89);
  text(page, "FECHAMENTO", LEFT + 12, y - 2, 8, true, .35);
  text(page, `Saldo encerrado agora: ${money(snapshot.totals.settlementCents)}`, LEFT + 12, y - 22, 12, true, .16);
  text(page, "Obrigado pelo seu trabalho e dedicação neste período.", LEFT + 12, y - 42, 9, false, .32);

  pages.forEach((item, index) => addPageFooter(item, index + 1, pages.length));
  return renderPdfObjects(pages);
}
