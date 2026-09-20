import { appDate, appMonthPeriod, shiftAppMonth } from "./app-date";
import { normalizeHelp } from "./help-guide";

export type ReportRequest = { start: string; end: string; scope: "self" | "shop"; metric: "summary" | "count"; person: string | null };
export type ReportMember = { id: number; name: string; count: number; revenueCents: number; payoutCents: number; tipsCents: number; feeCents: number; costCents: number };
export type ReportTotals = { members: ReportMember[]; membershipCents: number; membershipFeeCents: number; expensesCents: number };
export type ReportStyle = { detailScore?: number; warmthScore?: number; humorScore?: number; emojiScore?: number; initiativeScore?: number };
export function validReportRange(start: string, end: string) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
  return valid(start) && valid(end) && start <= end && Date.parse(end) - Date.parse(start) <= 366 * 86400000;
}
export function parseReport(question: string, owner: boolean, now = new Date()): ReportRequest | { clarification: string } | null {
  const text = normalizeHelp(question);
  if (/\b(como|onde|significa|explica|explicar)\b/.test(text)) return null;
  if (!/\b(quanto|quantos|faturei|faturou|fiz|fizemos|ganhei|rendeu|sobrou|faturamento|lucro|resumo|comissoes|comissao|resultado|producao)\b/.test(text)) return null;
  if (/\b(custa|preco|assinar|plano|assinatura)\b/.test(text)) return null;
  if (/\b(pix|cartao|dinheiro|debito|credito|cliente|clientes|pago|pagou|recebido|recebi|comparar|comparado|comparacao)\b/.test(text)) return {clarification:"Posso consultar o resumo de valores ou a quantidade de atendimentos registrados. Você quer o resultado geral de qual período?"};
  if (/\bquantos\b.*\b(cortes|barbas|produtos)\b/.test(text)) return {clarification:"Posso contar todos os atendimentos registrados. Quer essa quantidade? Para conferir um serviço específico, use o Histórico."};
  const today = appDate(now);
  let start = today, end = today;
  if (/mes passado/.test(text)) ({ start, end } = appMonthPeriod(shiftAppMonth(today, -1), today));
  else if (/\bmes\b/.test(text)) start = `${today.slice(0,7)}-01`;
  else if (/\bontem\b/.test(text)) start = end = appDate(now, -1);
  else if (/\bsemana\b/.test(text)) {
    const day = new Date(`${today}T12:00:00Z`).getUTCDay();
    start = appDate(now, -((day + 6) % 7));
    if (/passada/.test(text)) { end = appDate(new Date(`${start}T12:00:00Z`), -1); start = appDate(new Date(`${start}T12:00:00Z`), -7); }
  }
  const dates = question.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g);
  if (dates?.length) {
    const iso = (v: string) => { if (!v.includes("/")) return v; const [d,m,y] = v.split("/"); return `${y || today.slice(0,4)}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; };
    start = iso(dates[0]); end = iso(dates[1] || dates[0]);
  } else if (/\b(ano|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|ultimos|ultima|amanha|anteontem)\b|\b\d+\s*dias\b/.test(text)) {
    return { clarification: "Qual período? Pode escrever, por exemplo, de 01/08/2026 a 31/08/2026." };
  }
  if (!validReportRange(start,end)) return { clarification: "Confira as datas. Posso consultar um período de até um ano, como de 01/08/2026 a 31/08/2026." };
  const self = /\b(eu|meu|minha|meus|minhas|fiz|ganhei|faturei)\b/.test(text);
  const shop = /\b(barbearia|equipe|todos|geral|salao)\b/.test(text);
  const candidate = (question.match(/\b(?:quanto|quantos)\s+(?:que\s+)?(?:(?:o|a)\s+)?([\p{L}][\p{L} ]*?)\s+(?:fez|faturou|ganhou|atendeu)\b/iu)?.[1] || question.match(/\b(?:faturamento|comiss[aã]o|comiss[oõ]es|resultado)\s+(?:do|da)\s+([\p{L}][\p{L} ]*?)(?=\s+(?:hoje|ontem|neste|nesse|no|na|em|de)\b|[?!.,]|$)/iu)?.[1])?.trim() || null;
  const person = candidate && !/^(eu|voce|barbearia|minha barbearia|a barbearia)$/i.test(normalizeHelp(candidate)) ? candidate : null;
  return { start, end, scope: shop ? "shop" : self || !owner || person ? "self" : "shop", metric: /\b(quantos|quantidade)\b/.test(text) ? "count" : "summary", person: shop ? null : person };
}

export function formatReport(report: ReportRequest, totals: ReportTotals, viewerId: number) {
  const money = (cents: number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(cents/100);
  const date = (v: string) => v.split("-").reverse().join("/");
  const period = report.start === report.end ? date(report.start) : `${date(report.start)} a ${date(report.end)}`;
  const count = totals.members.reduce((sum,m) => sum + m.count,0);
  if (report.metric === "count") return `${period}: ${count} atendimento${count === 1 ? "" : "s"} registrado${count === 1 ? "" : "s"}${report.scope === "self" ? " para " + (totals.members[0]?.name || "você") : " na barbearia"}.`;
  const produced = totals.members.reduce((s,m) => s+m.revenueCents,0);
  const payouts = totals.members.reduce((s,m) => s+m.payoutCents,0);
  const tips = totals.members.reduce((s,m) => s+m.tipsCents,0);
  if (report.scope === "self") return `${period} · ${totals.members[0]?.name || "Você"}\n${count} atendimentos · ${money(produced)} em serviços e produtos.\nComissões: ${money(payouts - tips)}${tips ? ` + ${money(tips)} em gorjetas` : ""}.\nValores dos registros; comissão gerada não significa pagamento já realizado.`;
  const revenue = produced + totals.membershipCents;
  const fees = totals.members.reduce((s,m)=>s+m.feeCents,totals.membershipFeeCents);
  const costs = totals.members.reduce((s,m)=>s+m.costCents,0);
  const remainder = revenue - payouts - fees - costs - totals.expensesCents;
  const owner = totals.members.find(m=>m.id===viewerId);
  const rows = totals.members.filter(m=>m.count || m.revenueCents || m.payoutCents).map(m=>`${m.name}: ${money(m.revenueCents)} · comissão ${money(m.payoutCents - m.tipsCents)}${m.tipsCents ? ` + gorjetas ${money(m.tipsCents)}` : ""}`);
  return `${period}: a barbearia registrou ${money(revenue)}.\n${rows.join("\n") || "Nenhum atendimento ou venda registrado."}${totals.membershipCents ? `\nMensalidades: ${money(totals.membershipCents)} (contadas uma vez).` : ""}\nSobra da barbearia: ${money(remainder)}, após comissões, gorjetas, taxas, custo dos produtos e despesas lançadas.${owner ? `\nSua comissão: ${money(owner.payoutCents - owner.tipsCents)}${owner.tipsCents ? ` + gorjetas ${money(owner.tipsCents)}` : ""}, já separada da sobra.` : ""}\nBaseado somente no que foi registrado. Comissões geradas não indicam pagamento realizado.`;
}

export function formatReportReply(report: ReportRequest, totals: ReportTotals, viewerId: number, style: ReportStyle = {}) {
  const money = (cents: number) => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(cents/100);
  const date = (v: string) => v.split("-").reverse().join("/");
  const period = report.start === report.end ? date(report.start) : `${date(report.start)} a ${date(report.end)}`;
  const count = totals.members.reduce((sum,m) => sum + m.count,0);
  const produced = totals.members.reduce((sum,m) => sum + m.revenueCents,0);
  const payouts = totals.members.reduce((sum,m) => sum + m.payoutCents,0);
  const tips = totals.members.reduce((sum,m) => sum + m.tipsCents,0);
  const warm = Number(style.warmthScore ?? 75) >= 60;
  const detail = Number(style.detailScore ?? 55);
  const emoji = Number(style.emojiScore ?? 10) >= 65 ? " 👍" : "";

  if (report.metric === "count") {
    const who = report.scope === "self" ? (totals.members[0]?.name || "você") : "a barbearia";
    return { answer: `${warm ? "Certo! " : ""}${period}: ${who} teve ${count} atendimento${count === 1 ? "" : "s"} registrado${count === 1 ? "" : "s"}.${emoji}` };
  }

  if (report.scope === "self") {
    const member = totals.members[0];
    const commission = payouts - tips;
    const answer = `${warm ? "Boa! " : ""}${period}: ${member?.name || "Você"} fez ${money(produced)} em ${count} atendimento${count === 1 ? "" : "s"}.`;
    const details = [
      `Comissão gerada: ${money(commission)}${tips ? ` + ${money(tips)} em gorjetas` : ""}.`,
      "Os valores são baseados no que foi registrado; comissão gerada não significa pagamento já realizado.",
    ].join("\n");
    return { answer, ...(detail >= 45 ? { details } : {}) };
  }

  const revenue = produced + totals.membershipCents;
  const fees = totals.members.reduce((sum,m)=>sum+m.feeCents,totals.membershipFeeCents);
  const costs = totals.members.reduce((sum,m)=>sum+m.costCents,0);
  const remainder = revenue - payouts - fees - costs - totals.expensesCents;
  const owner = totals.members.find(m=>m.id===viewerId);
  const answer = `${warm ? "Certo! " : ""}${period}: a barbearia registrou ${money(revenue)} em ${count} atendimento${count === 1 ? "" : "s"}. A sobra calculada está em ${money(remainder)}.${emoji}`;
  const rows = totals.members
    .filter(m=>m.count || m.revenueCents || m.payoutCents)
    .map(m=>`${m.name}: ${money(m.revenueCents)} · comissão ${money(m.payoutCents - m.tipsCents)}${m.tipsCents ? ` + gorjetas ${money(m.tipsCents)}` : ""}`);
  const detailLines = [
    ...rows,
    ...(totals.membershipCents ? [`Mensalidades: ${money(totals.membershipCents)} (contadas uma vez).`] : []),
    `Sobra da barbearia: ${money(remainder)}, após comissões, gorjetas, taxas, custo dos produtos e despesas lançadas.`,
    ...(owner ? [`Sua comissão: ${money(owner.payoutCents - owner.tipsCents)}${owner.tipsCents ? ` + gorjetas ${money(owner.tipsCents)}` : ""}, já separada da sobra.`] : []),
    "Baseado somente no que foi registrado. Comissões geradas não indicam pagamento realizado.",
  ];
  return { answer, details: detailLines.join("\n") };
}

