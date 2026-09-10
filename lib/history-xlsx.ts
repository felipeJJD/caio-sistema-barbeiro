import { strToU8, zipSync } from "fflate";

export type HistoryWorkbookRow = {
  occurredAt: string;
  time: string;
  kind: "attendance" | "product" | "appointment";
  type: string;
  clientName: string;
  professionalName: string;
  description: string;
  quantity: number;
  paymentLabel: string;
  paymentGroupName: string;
  serviceCents: number;
  tipCents: number;
  productCents: number;
  totalCents: number;
  payoutCents: number;
  detail: string;
};

export type HistoryWorkbookInput = {
  organizationName: string;
  periodStart: string;
  periodEnd: string;
  professionalLabel: string;
  professionalOrder: string[];
  rows: HistoryWorkbookRow[];
};

type CellStyle =
  | "normal"
  | "title"
  | "metaLabel"
  | "metaValue"
  | "section"
  | "header"
  | "text"
  | "date"
  | "time"
  | "integer"
  | "money"
  | "totalLabel"
  | "totalMoney"
  | "highlight"
  | "highlightMoney";

type SheetCell = {
  value?: string | number | null;
  style?: CellStyle;
  formula?: string;
  result?: number;
};

type SheetRow = { cells: SheetCell[]; height?: number };
type WorkbookSheet = {
  name: string;
  rows: SheetRow[];
  widths: number[];
  merges?: string[];
  freezeRows?: number;
  autoFilter?: string;
  tabColor?: string;
};

const styleIds: Record<CellStyle, number> = {
  normal: 0,
  title: 1,
  metaLabel: 2,
  metaValue: 3,
  section: 4,
  header: 5,
  text: 6,
  date: 7,
  time: 8,
  integer: 9,
  money: 10,
  totalLabel: 11,
  totalMoney: 12,
  highlight: 13,
  highlightMoney: 14,
};

const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const detailHeaders = ["Data", "Hora", "Tipo", "Cliente", "Barbeiro", "Serviço ou produto", "Quantidade", "Pagamento", "Serviço (R$)", "Gorjeta (R$)", "Produtos (R$)", "Total (R$)", "Repasse (R$)", "Origem / detalhe"];
const detailWidths = [12, 9, 15, 24, 18, 27, 11, 19, 15, 15, 15, 15, 15, 27];

function xml(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function excelDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 0;
  return (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - Date.UTC(1899, 11, 30)) / 86400000;
}

function excelTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) / 1440;
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

type PaymentKey = "cash" | "pix" | "debit" | "credit" | "other";

function normalizedPayment(value: string): PaymentKey {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (normalized.includes("pix")) return "pix";
  if (normalized.includes("debito")) return "debit";
  if (normalized.includes("credito")) return "credit";
  if (normalized.includes("dinheiro")) return "cash";
  return "other";
}

function safeSheetBase(value: string) {
  const cleaned = value.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "");
  return (cleaned || "Profissional").slice(0, 31);
}

function uniqueSheetNames(names: string[]) {
  const used = new Set(["resumo"]);
  return names.map((name) => {
    const base = safeSheetBase(name);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLocaleLowerCase("pt-BR"))) {
      const ending = ` (${suffix})`;
      candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
      suffix += 1;
    }
    used.add(candidate.toLocaleLowerCase("pt-BR"));
    return candidate;
  });
}

function formulaSheetName(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderCell(cell: SheetCell, rowIndex: number, columnIndex: number) {
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
  const style = styleIds[cell.style ?? "normal"];
  const styleAttribute = style ? ` s="${style}"` : "";
  if (cell.formula) return `<c r="${reference}"${styleAttribute}><f>${xml(cell.formula)}</f><v>${Number(cell.result ?? 0)}</v></c>`;
  if (typeof cell.value === "number") return `<c r="${reference}"${styleAttribute}><v>${Number.isFinite(cell.value) ? cell.value : 0}</v></c>`;
  if (cell.value === null || cell.value === undefined || cell.value === "") return `<c r="${reference}"${styleAttribute}/>`;
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`;
}

function renderSheet(sheet: WorkbookSheet) {
  const maxColumns = Math.max(sheet.widths.length, ...sheet.rows.map((row) => row.cells.length));
  const maxRows = Math.max(1, sheet.rows.length);
  const pane = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/>`
    : "";
  const columns = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}"${row.height ? ` ht="${row.height}" customHeight="1"` : ""}>${row.cells.map((cell, columnIndex) => renderCell(cell, rowIndex, columnIndex)).join("")}</row>`).join("");
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((reference) => `<mergeCell ref="${reference}"/>`).join("")}</mergeCells>` : "";
  return `${xmlHeader}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>${sheet.tabColor ? `<tabColor rgb="${sheet.tabColor}"/>` : ""}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${columnName(maxColumns - 1)}${maxRows}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns}</cols><sheetData>${rows}</sheetData>${sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : ""}${merges}<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function detailSheet(name: string, rows: HistoryWorkbookRow[]) {
  const firstDetailRow = 6;
  const lastDetailRow = firstDetailRow + rows.length - 1;
  const totalRow = lastDetailRow + 1;
  const sheetRows: SheetRow[] = [
    { height: 31, cells: [{ value: "CORTOU ANOTOU · HISTÓRICO DO PROFISSIONAL", style: "title" }] },
    { cells: [{ value: "Profissional", style: "metaLabel" }, { value: name, style: "metaValue" }] },
    { cells: [{ value: "Lançamentos", style: "metaLabel" }, { value: rows.length, style: "integer" }] },
    { cells: [] },
    { height: 30, cells: detailHeaders.map((value) => ({ value, style: "header" })) },
    ...rows.map((row): SheetRow => ({ cells: [
      { value: excelDate(row.occurredAt), style: "date" },
      { value: excelTime(row.time), style: row.time ? "time" : "text" },
      { value: row.type, style: "text" },
      { value: row.clientName, style: "text" },
      { value: row.professionalName, style: "text" },
      { value: row.description, style: "text" },
      { value: row.quantity, style: "integer" },
      { value: row.paymentLabel, style: "text" },
      { value: row.kind === "attendance" ? row.serviceCents / 100 : null, style: "money" },
      { value: row.kind === "attendance" ? row.tipCents / 100 : null, style: "money" },
      { value: row.kind === "product" ? row.productCents / 100 : null, style: "money" },
      { value: row.kind === "appointment" ? null : row.totalCents / 100, style: "money" },
      { value: row.kind === "appointment" ? null : row.payoutCents / 100, style: "money" },
      { value: row.detail, style: "text" },
    ] })),
    { height: 23, cells: [
      { value: "TOTAIS", style: "totalLabel" },
      ...Array.from({ length: 7 }, () => ({ value: null, style: "totalLabel" as const })),
      ...["I", "J", "K", "L", "M"].map((column, index) => ({ formula: `SUM(${column}${firstDetailRow}:${column}${lastDetailRow})`, result: rows.reduce((sum, row) => {
        if (index === 0) return sum + (row.kind === "attendance" ? row.serviceCents : 0);
        if (index === 1) return sum + (row.kind === "attendance" ? row.tipCents : 0);
        if (index === 2) return sum + (row.kind === "product" ? row.productCents : 0);
        if (index === 3) return sum + (row.kind === "appointment" ? 0 : row.totalCents);
        return sum + (row.kind === "appointment" ? 0 : row.payoutCents);
      }, 0) / 100, style: "totalMoney" as const })),
      { value: null, style: "totalLabel" },
    ] },
  ];
  return {
    sheet: { name, rows: sheetRows, widths: detailWidths, merges: ["A1:N1", "B2:N2"], freezeRows: 5, autoFilter: `A5:N${lastDetailRow}`, tabColor: "FFD7A642" } satisfies WorkbookSheet,
    firstDetailRow,
    lastDetailRow,
    totalRow,
  };
}

function stylesXml() {
  return `${xmlHeader}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="166" formatCode="hh:mm"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Arial"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Georgia"/><family val="1"/></font><font><b/><color rgb="FF252923"/><sz val="11"/><name val="Arial"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/><family val="2"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF30362F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7A642"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4E7C6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F4EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDEDCD2"/></left><right style="thin"><color rgb="FFDEDCD2"/></right><top style="thin"><color rgb="FFDEDCD2"/></top><bottom style="thin"><color rgb="FFDEDCD2"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="15"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="165" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="165" fontId="2" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

export function buildHistoryWorkbook(input: HistoryWorkbookInput) {
  const groupMap = new Map<string, HistoryWorkbookRow[]>();
  for (const row of input.rows) groupMap.set(row.professionalName, [...(groupMap.get(row.professionalName) ?? []), row]);
  const requestedOrder = [...new Set(input.professionalOrder)];
  const professionals = [
    ...requestedOrder.filter((name) => groupMap.has(name)),
    ...[...groupMap.keys()].filter((name) => !requestedOrder.includes(name)).sort((left, right) => left.localeCompare(right, "pt-BR")),
  ];
  const sheetNames = uniqueSheetNames(professionals);
  const detailSheets = professionals.map((professional, index) => detailSheet(sheetNames[index], groupMap.get(professional) ?? []));
  const totals = input.rows.reduce((result, row) => {
    if (row.kind === "attendance") result.attendances += 1;
    if (row.kind === "product") result.products += 1;
    if (row.kind === "appointment") result.appointments += 1;
    if (row.kind !== "appointment") {
      result.totalCents += row.totalCents;
      result.payoutCents += row.payoutCents;
      result.payments[normalizedPayment(row.paymentGroupName)] += row.totalCents;
    }
    return result;
  }, { attendances: 0, products: 0, appointments: 0, totalCents: 0, payoutCents: 0, payments: { cash: 0, pix: 0, debit: 0, credit: 0, other: 0 } });
  const professionalStartRow = 25;
  const professionalEndRow = professionalStartRow + detailSheets.length - 1;
  const summaryRows: SheetRow[] = [
    { height: 31, cells: [{ value: "CORTOU ANOTOU · RESUMO DO HISTÓRICO", style: "title" }] },
    { cells: [{ value: "Barbearia", style: "metaLabel" }, { value: input.organizationName, style: "metaValue" }] },
    { cells: [{ value: "Período", style: "metaLabel" }, { value: `${displayDate(input.periodStart)} a ${displayDate(input.periodEnd)}`, style: "metaValue" }] },
    { cells: [{ value: "Filtro", style: "metaLabel" }, { value: input.professionalLabel, style: "metaValue" }] },
    { cells: [] },
    { height: 23, cells: [{ value: "RESUMO GERAL", style: "section" }] },
    { height: 25, cells: [{ value: "Indicador", style: "header" }, { value: "Resultado", style: "header" }] },
    { cells: [{ value: "Lançamentos exportados", style: "text" }, { value: input.rows.length, style: "integer" }] },
    { cells: [{ value: "Atendimentos", style: "text" }, { value: totals.attendances, style: "integer" }] },
    { cells: [{ value: "Vendas de produtos", style: "text" }, { value: totals.products, style: "integer" }] },
    { cells: [{ value: "Horários concluídos", style: "text" }, { value: totals.appointments, style: "integer" }] },
    { cells: [{ value: "Total geral", style: "highlight" }, { formula: detailSheets.length ? `SUM(E${professionalStartRow}:E${professionalEndRow})` : "0", result: totals.totalCents / 100, style: "highlightMoney" }] },
    { cells: [{ value: "Total de repasse", style: "highlight" }, { formula: detailSheets.length ? `SUM(F${professionalStartRow}:F${professionalEndRow})` : "0", result: totals.payoutCents / 100, style: "highlightMoney" }] },
    { cells: [] },
    { height: 23, cells: [{ value: "FORMAS DE PAGAMENTO", style: "section" }] },
    { height: 25, cells: [{ value: "Forma", style: "header" }, { value: "Total", style: "header" }] },
    { cells: [{ value: "Dinheiro", style: "text" }, { value: totals.payments.cash / 100, style: "money" }] },
    { cells: [{ value: "Pix", style: "text" }, { value: totals.payments.pix / 100, style: "money" }] },
    { cells: [{ value: "Débito", style: "text" }, { value: totals.payments.debit / 100, style: "money" }] },
    { cells: [{ value: "Crédito", style: "text" }, { value: totals.payments.credit / 100, style: "money" }] },
    { cells: [{ value: "Outras formas", style: "text" }, { value: totals.payments.other / 100, style: "money" }] },
    { cells: [] },
    { height: 23, cells: [{ value: "RESULTADOS POR PROFISSIONAL", style: "section" }] },
    { height: 30, cells: ["Profissional", "Atendimentos", "Produtos", "Horários", "Total geral", "Repasse"].map((value) => ({ value, style: "header" })) },
    ...detailSheets.map((detail, index): SheetRow => {
      const professionalRows = groupMap.get(professionals[index]) ?? [];
      return { cells: [
        { value: professionals[index], style: "text" },
        { value: professionalRows.filter((row) => row.kind === "attendance").length, style: "integer" },
        { value: professionalRows.filter((row) => row.kind === "product").length, style: "integer" },
        { value: professionalRows.filter((row) => row.kind === "appointment").length, style: "integer" },
        { formula: `${formulaSheetName(detail.sheet.name)}!L${detail.totalRow}`, result: professionalRows.reduce((sum, row) => sum + (row.kind === "appointment" ? 0 : row.totalCents), 0) / 100, style: "money" },
        { formula: `${formulaSheetName(detail.sheet.name)}!M${detail.totalRow}`, result: professionalRows.reduce((sum, row) => sum + (row.kind === "appointment" ? 0 : row.payoutCents), 0) / 100, style: "money" },
      ] };
    }),
    { height: 23, cells: [
      { value: "TOTAL DA EQUIPE", style: "totalLabel" },
      ...["B", "C", "D"].map((column) => ({ formula: `SUM(${column}${professionalStartRow}:${column}${professionalEndRow})`, result: 0, style: "totalLabel" as const })),
      { formula: `SUM(E${professionalStartRow}:E${professionalEndRow})`, result: totals.totalCents / 100, style: "totalMoney" },
      { formula: `SUM(F${professionalStartRow}:F${professionalEndRow})`, result: totals.payoutCents / 100, style: "totalMoney" },
    ] },
  ];
  const teamTotalRow = professionalEndRow + 1;
  const attendanceTotal = totals.attendances;
  const productTotal = totals.products;
  const appointmentTotal = totals.appointments;
  summaryRows[teamTotalRow - 1].cells[1].result = attendanceTotal;
  summaryRows[teamTotalRow - 1].cells[2].result = productTotal;
  summaryRows[teamTotalRow - 1].cells[3].result = appointmentTotal;
  const sheets: WorkbookSheet[] = [
    { name: "Resumo", rows: summaryRows, widths: [28, 18, 15, 15, 17, 17], merges: ["A1:F1", "B2:F2", "B3:F3", "B4:F4", "A6:F6", "A15:F15", "A23:F23"], freezeRows: 4, tabColor: "FF30362F" },
    ...detailSheets.map((detail) => detail.sheet),
  ];
  const workbookRelationships = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`, ...sheets.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)].join("");
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 2}"/>`).join("");
  const contentOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const createdAt = new Date().toISOString();
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${contentOverrides}</Types>`),
    "_rels/.rels": strToU8(`${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/app.xml": strToU8(`${xmlHeader}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Cortou Anotou</Application><AppVersion>1.0</AppVersion></Properties>`),
    "docProps/core.xml": strToU8(`${xmlHeader}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Histórico · Cortou Anotou</dc:title><dc:creator>Cortou Anotou</dc:creator><cp:lastModifiedBy>Cortou Anotou</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`),
    "xl/workbook.xml": strToU8(`${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}</Relationships>`),
    "xl/styles.xml": strToU8(stylesXml()),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(renderSheet(sheet)); });
  const zipped = zipSync(files, { level: 6 });
  return new Uint8Array(zipped).buffer;
}
