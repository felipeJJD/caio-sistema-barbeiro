import type { AccessContext } from "./access";
import { normalizeHelp } from "../lib/help-guide";
import { formatReport, formatReportReply, validReportRange, type ReportMember, type ReportRequest, type ReportStyle } from "../lib/help-reports";
import { readDailyPaceInsight } from "./help-insights";
import { helpIntentContext } from "../lib/help-intent";

type Result<T> = {success:boolean;results:T[]};
type Statement = {bind(...args:Array<string|number|null>):Statement;all<T>():Promise<Result<T>>};
type ReportDatabase = {prepare(sql:string):Statement;batch<T>(statements:Statement[]):Promise<Result<T>[]>};

function oneEditApart(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  if (i < left.length || j < right.length) edits++;
  return edits <= 1;
}

// Pure prepared SELECTs: no dashboard seeding, write side effects, or zero fallback on failure.
export async function readHelpReport(access: AccessContext, requested: ReportRequest, style?: ReportStyle) {
  requested = {...requested,scope:requested.person ? "self" : requested.scope};
  if (!validReportRange(requested.start, requested.end)) throw new Error("Período inválido.");
  if (!access.isOwner && (requested.scope === "shop" || requested.person)) {
    return { answer: "No seu acesso posso consultar somente seus próprios atendimentos e comissões. Quer saber quanto você fez hoje?", suggestions: ["Quanto eu fiz hoje?"] };
  }
  const { env } = await import("@/runtime/env");
  const db = (env as unknown as {DB?:ReportDatabase}).DB;
  if (!db) throw new Error("Dados indisponíveis.");
  let memberId: number | null = requested.scope === "self" ? access.teamMemberId : null;
  if (requested.person && access.isOwner) {
    const candidates = await db.prepare("SELECT id, name FROM team WHERE organization_id = ?").bind(access.organizationId).all<{id:number;name:string}>();
    const name = normalizeHelp(requested.person);
    let matches = candidates.results.filter(m=>normalizeHelp(m.name) === name || normalizeHelp(m.name).split(" ")[0] === name);
    if (!matches.length) {
      matches = candidates.results.filter((member) => {
        const registered = normalizeHelp(member.name).split(" ")[0];
        const spoken = name.split(" ")[0];
        return spoken.length >= 3 && registered.length >= 3 && oneEditApart(registered, spoken);
      });
    }
    if (matches.length !== 1) return { answer: matches.length ? "Há mais de um profissional com esse nome. Qual é o nome completo?" : "Não encontrei esse profissional nesta barbearia. Qual é o nome cadastrado?" };
    memberId = matches[0].id;
  }
  // The authenticated session is the ONLY source for tenant and employee scope.
  if (!access.isOwner) memberId = access.teamMemberId;
  const args = [access.organizationId, requested.start, requested.end, memberId, memberId];
  const statements = [
    db.prepare(`SELECT barber_id AS id, SUM(quantity) AS count, SUM(value_cents + tip_cents) AS revenueCents,
      SUM(commission_cents + tip_cents) AS payoutCents, SUM(tip_cents) AS tipsCents, SUM(fee_cents) AS feeCents
      FROM daily_records WHERE organization_id = ? AND occurred_at BETWEEN ? AND ? AND (? IS NULL OR barber_id = ?) GROUP BY barber_id`).bind(...args),
    db.prepare(`SELECT seller_team_member_id AS id, SUM(quantity * unit_price_cents) AS revenueCents,
      SUM(commission_cents) AS payoutCents, SUM(fee_cents) AS feeCents, SUM(quantity * unit_cost_cents) AS costCents
      FROM product_sales WHERE organization_id = ? AND occurred_at BETWEEN ? AND ? AND (? IS NULL OR seller_team_member_id = ?) GROUP BY seller_team_member_id`).bind(...args),
    db.prepare("SELECT id, name FROM team WHERE organization_id = ? AND (? IS NULL OR id = ?)").bind(access.organizationId,memberId,memberId),
  ];
  const shop = access.isOwner && requested.scope === "shop";
  if (shop) {
    statements.push(db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS amount, COALESCE(SUM(fee_cents),0) AS fees FROM membership_payments WHERE organization_id = ? AND occurred_at BETWEEN ? AND ?").bind(access.organizationId,requested.start,requested.end));
    statements.push(db.prepare("SELECT COALESCE(SUM(value_cents),0) AS amount FROM expenses WHERE organization_id = ? AND occurred_at BETWEEN ? AND ?").bind(access.organizationId,requested.start,requested.end));
  }
  const results = await db.batch<Record<string,number|string>>(statements);
  if (results.some(result=>!result.success)) throw new Error("Consulta incompleta.");
  const members: ReportMember[] = results[2].results.map(m=>({id:Number(m.id),name:String(m.name),count:0,revenueCents:0,payoutCents:0,tipsCents:0,feeCents:0,costCents:0}));
  for (const group of results.slice(0,2)) for (const row of group.results) {
    let member = members.find(m=>m.id===Number(row.id));
    if (!member) { member={id:Number(row.id),name:"Profissional arquivado",count:0,revenueCents:0,payoutCents:0,tipsCents:0,feeCents:0,costCents:0}; members.push(member); }
    for (const key of ["count","revenueCents","payoutCents","tipsCents","feeCents","costCents"] as const) member[key] += Number(row[key] || 0);
  }
  const resolvedReport = {...requested,scope:shop?"shop":"self"} as ReportRequest;
  const totals = {
    members,
    membershipCents:Number(results[3]?.results[0]?.amount || 0),
    membershipFeeCents:Number(results[3]?.results[0]?.fees || 0),
    expensesCents:Number(results[4]?.results[0]?.amount || 0),
  };
  if (!style) return { answer: formatReport(resolvedReport, totals, access.teamMemberId) };

  const reply = formatReportReply(resolvedReport, totals, access.teamMemberId, style);
  let insight: string | undefined;
  if (Number(style.initiativeScore ?? 70) >= 55) {
    try {
      insight = await readDailyPaceInsight(access, resolvedReport) ?? undefined;
    } catch (error) {
      console.warn("help_insight_unavailable", { type: error instanceof Error ? error.name : "Unknown" });
    }
  }
  const contextMessage=helpIntentContext({tool:resolvedReport.person?"get_employee_results":"get_revenue",start:resolvedReport.start,end:resolvedReport.end,scope:resolvedReport.scope,metric:resolvedReport.metric,person:resolvedReport.person??"",afterTime:"",atTime:"",service:"",client:""});
  return { ...reply, insight, contextMessage };
}
