import { appDate, appMonthPeriod, shiftAppMonth } from "./app-date";
import { normalizeHelp, type HelpMessage } from "./help-guide";
import { SAFE_ASSISTANT_CONTEXT_PREFIX } from "./help-conversation";
import { validReportRange } from "./help-reports";
import { parseReport } from "./help-reports";

// This catalog is the only vocabulary the language model can use to request reads.
// Each executor independently applies the authenticated organization's scope.
export const HELP_TOOLS = {
  get_appointments: { domain: "agenda", description: "Agendamentos reais em appointments, inclusive próximo cliente e horários ocupados" },
  get_next_appointment: { domain: "agenda", description: "Próximo cliente agendado depois da hora atual" },
  get_available_slots: { domain: "agenda", description: "Vagas reais da página pública, para um serviço e uma data" },
  get_revenue: { domain: "financeiro", description: "Faturamento, sobra e quantidade de atendimentos realizados" },
  get_employee_results: { domain: "atendimentos", description: "Produção e comissão gerada de um profissional" },
  get_financial_summary: { domain: "financeiro", description: "Resumo financeiro da barbearia" },
  get_commission_breakdown: { domain: "financeiro", description: "Explicação da comissão gerada, gorjetas e diferença para pagamentos" },
  get_recent_records: { domain: "atendimentos", description: "Verificar últimos atendimentos realmente registrados no banco" },
  get_client_return_opportunities: { domain: "clientes", description: "Clientes com retorno atrasado segundo histórico" },
  get_monthly_members: { domain: "mensalistas", description: "Mensalistas ativos e vencimentos" },
  get_services: { domain: "serviços", description: "Serviços, preço, duração e situação" },
  get_payment_methods: { domain: "pagamentos", description: "Formas de pagamento e taxas configuradas" },
  get_products: { domain: "produtos", description: "Produtos e estoque" },
  get_team_schedule: { domain: "equipe", description: "Expediente configurado por profissional" },
  get_public_booking_status: { domain: "agendamento público", description: "Link público, configuração e estado de funcionamento" },
  diagnose_booking_problem: { domain: "agendamento público", description: "Investigar por que o cliente não consegue marcar" },
} as const;
export type HelpToolId = keyof typeof HELP_TOOLS;
export const helpToolIds = Object.keys(HELP_TOOLS) as HelpToolId[];

export type HelpIntent = {
  tool: HelpToolId;
  start: string;
  end: string;
  scope: "self" | "shop";
  metric: "summary" | "count";
  person: string;
  afterTime: string;
  atTime: string;
  service: string;
  client: string;
};

export function normalizeHelpIntent(value: unknown): HelpIntent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<HelpIntent>;
  if (!helpToolIds.includes(raw.tool as HelpToolId)) return null;
  if (!validReportRange(String(raw.start), String(raw.end))) return null;
  if ((raw.tool === "get_appointments" || raw.tool === "get_next_appointment" || raw.tool === "get_available_slots") && Date.parse(String(raw.end)) - Date.parse(String(raw.start)) > 31 * 86400000) return null;
  const safe = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 120) : "";
  const afterTime = safe(raw.afterTime);
  if (afterTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(afterTime)) return null;
  const atTime=safe(raw.atTime);
  if (atTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(atTime)) return null;
  return { tool: raw.tool as HelpToolId, start: String(raw.start), end: String(raw.end), scope: raw.scope === "self" ? "self" : "shop", metric: raw.metric === "count" ? "count" : "summary", person: safe(raw.person), afterTime, atTime, service: safe(raw.service), client: safe(raw.client) };
}

export function helpIntentContext(intent: HelpIntent) {
  return `${SAFE_ASSISTANT_CONTEXT_PREFIX} INTENT:${JSON.stringify(intent)}`;
}

export function lastHelpIntent(messages: HelpMessage[]): HelpIntent | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const marker = `${SAFE_ASSISTANT_CONTEXT_PREFIX} INTENT:`;
    if (!message.content.startsWith(marker)) continue;
    try { return normalizeHelpIntent(JSON.parse(message.content.slice(marker.length))); } catch { return null; }
  }
  return null;
}

const WEEKDAYS: Record<string,number> = { domingo:0, segunda:1, terca:2, quarta:3, quinta:4, sexta:5, sabado:6 };

// Apply only slots explicitly mentioned. The model also receives this context,
// but a short continuation does not need a second parse through older user text.
export function periodFromSpeech(question: string, now = new Date()): {start:string;end:string} | null {
  const clean = normalizeHelp(question);
  const today = appDate(now);
  if (/\b(depois de amanha)\b/.test(clean)) { const day=appDate(now,2); return {start:day,end:day}; }
  if (/\bamanha\b/.test(clean)) { const day=appDate(now,1); return {start:day,end:day}; }
  if (/\banteontem\b/.test(clean)) { const day=appDate(now,-2); return {start:day,end:day}; }
  if (/\bontem\b/.test(clean)) { const day=appDate(now,-1); return {start:day,end:day}; }
  if (/\bhoje\b/.test(clean)) return {start:today,end:today};
  const namedMonth = /\bmes passado\b/.test(clean) ? shiftAppMonth(today,-1) : /\b(este mes|esse mes|neste mes|mes atual)\b/.test(clean) ? today.slice(0,7) : null;
  if (namedMonth) return appMonthPeriod(namedMonth,today);
  if (/\bsemana passada\b/.test(clean)) {
    const day = new Date(`${today}T12:00:00Z`).getUTCDay();
    return {start:appDate(now,-((day+6)%7)-7),end:appDate(now,-((day+6)%7)-1)};
  }
  if (/\b(esta semana|essa semana|nesta semana)\b/.test(clean)) {
    const day = new Date(`${today}T12:00:00Z`).getUTCDay();
    return {start:appDate(now,-((day+6)%7)),end:today};
  }
  const weekday = clean.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/);
  if (weekday) {
    const current = new Date(`${today}T12:00:00Z`).getUTCDay();
    let offset = (current - WEEKDAYS[weekday[1]] + 7) % 7;
    if (/passad[ao]/.test(clean) && offset === 0) offset = 7;
    const day = appDate(now,-offset); return {start:day,end:day};
  }
  const dates = question.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g);
  if (dates?.length) {
    const iso = (v:string) => { if (!v.includes("/")) return v; const [d,m,y]=v.split("/"); return `${y || today.slice(0,4)}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; };
    return {start:iso(dates[0]),end:iso(dates.at(-1)!)};
  }
  return null;
}

export function continueHelpIntent(question: string, previous: HelpIntent, now = new Date()): HelpIntent {
  const clean = normalizeHelp(question);
  const patch: Partial<HelpIntent> = periodFromSpeech(question,now) ?? {};
  if (/\b(faturou|faturamento|ganhou|ganhei|fiz|reais|lucro|comissao|quanto\b.*\bfez)\b/.test(clean)) {
    const report=parseReport(question,true,now);
    patch.tool=/\b(comissao)\b.*\b(errad|explica|calculo)\b/.test(clean)?"get_commission_breakdown":report&&!('clarification' in report)&&report.person?"get_employee_results":"get_revenue";
    if(report&&!('clarification' in report)) {
      if(report.person){patch.person=report.person;patch.scope="self";}
      if(/\b(barbearia|equipe|geral)\b/.test(clean)){patch.person="";patch.scope="shop";}
      patch.metric=report.metric;
    }
  }
  if (/\b(todos|todas|equipe|geral|barbearia)\b/.test(clean)) { patch.person=""; patch.scope="shop"; }
  else if (/\b(eu|meu|minha|so eu)\b/.test(clean)) { patch.person=""; patch.scope="self"; }
  // The new member name is resolved and authorized at query time, never here.
  const person = question.trim().replace(/[.!?]+$/,"").match(/^(?:(?:e|agora|só|so|do|da)\s+)?(?:o|a|do|da)?\s*([\p{L}]{2,}(?:\s+[\p{L}]{2,})?)$/iu);
  if (person && patch.person===undefined && !periodFromSpeech(question,now) && !/^(todos?|todas?|geral|equipe|barbearia|ele|ela|isso|sim|nao|mostra|horarios?|agendamentos?)$/.test(normalizeHelp(person[1]))) {
    patch.person=person[1]; patch.scope="self";
  }
  const time=afterTimeFromSpeech(question);
  if(time){patch.afterTime=time;patch.atTime="";}
  const exact=atTimeFromSpeech(question);
  if(exact){patch.atTime=exact;patch.afterTime="";}
  if (/\b(antes das?|dia inteiro|todos os horarios)\b/.test(clean)) patch.afterTime="";
  if (/\b(agendament\w*|agendad\w*|agenda|marcad\w*|horarios? livres?|vagas?)\b/.test(clean) && !/\b(atendimento realizado|corte feito)\b/.test(clean)) patch.tool=/\b(livre|vagas?|disponiv)/.test(clean)?"get_available_slots":"get_appointments";
  if (/\b(reais|r\$|faturamento|comissao|dinheiro|valor|lucro)\b/.test(clean)) patch.metric="summary";
  if (/\b(quantos|quantidade)\b/.test(clean) && !/\b(reais|r\$|faturamento|comissao|dinheiro|valor|lucro)\b/.test(clean)) patch.metric="count";
  return {...previous,...patch};
}

export function afterTimeFromSpeech(question:string):string {
  const clean=normalizeHelp(question);
  const match=clean.match(/\b(?:depois das?|apos as?|a partir das?)\s*(\d{1,2}|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)(?:\s*h\s*(\d{1,2}))?\b/);
  if(!match)return "";
  const number=Number(match[1])||({tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12} as Record<string,number>)[match[1]];
  const minutes=Number(match[2]??0);
  if(!Number.isInteger(number)||number>23||minutes>59)return "";
  const hour=number>=1&&number<=7&&!/\b(da manha|de madrugada)\b/.test(clean)?number+12:number;
  return `${String(hour).padStart(2,"0")}:${String(minutes).padStart(2,"0")}`;
}

export function atTimeFromSpeech(question:string):string {
  const clean=normalizeHelp(question);
  if (/\b(depois|apos|a partir)\b/.test(clean)) return "";
  const match=clean.match(/\b(?:as|para as)\s*(\d{1,2})(?:\s*h\s*(\d{1,2}))?\b/);
  if (!match || !/\b(marcad\w*|agend\w*|horario\w*|vaga\w*)\b/.test(clean))return "";
  const hour=Number(match[1]),minute=Number(match[2]??0);
  if(hour>23||minute>59)return "";
  return `${String(hour>=1&&hour<=7?hour+12:hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

const READ_DOMAINS: Array<{tool:HelpToolId;pattern:RegExp}> = [
  {tool:"diagnose_booking_problem",pattern:/\b(cliente|pessoa)\b.*\b(nao consegue|nao da|falhou|erro|problema)\b.*\b(agend\w*|marc\w*|horario\w*)\b|\b(agendamento|link)\b.*\b(erro|nao funciona|falhou)/},
  {tool:"get_available_slots",pattern:/\b(livres?|disponiveis?|vagas?)\b.*\b(horarios?|agenda|agendar)|\b(horarios?|agenda)\b.*\b(livres?|disponiveis?|vagas?)\b/},
  {tool:"get_next_appointment",pattern:/\b(proximo|proxima)\s+(cliente|horario|agendamento)\b/},
  {tool:"get_public_booking_status",pattern:/\b(link|url)\b.*\b(agend\w*|clientes?|barbearia)\b|\b(agend\w*|clientes?)\b.*\b(link|url)\b/},
  {tool:"get_appointments",pattern:/\b(agenda|agendament\w*|agendad\w*|marcad\w*|horarios?|reservad\w*)\b/},
  {tool:"get_client_return_opportunities",pattern:/\b(clientes?|pessoas?)\b.*\b(sumid|voltar|retorn|demorando|atrasad)|\b(quem)\b.*\b(nao voltou|nao veio)\b/},
  {tool:"get_recent_records",pattern:/\b(corte|atendimento)\b.*\b(nao apareceu|sumiu|nao chegou|registrou)\b/},
  {tool:"get_commission_breakdown",pattern:/\b(comissao|comissoes)\b.*\b(errad|explica|porque|por que|calculo|pagamento)\b/},
  {tool:"get_team_schedule",pattern:/\b(expediente|horario de trabalho|horarios? dos? (?:barbeiros?|profissionais?))\b/},
  {tool:"get_monthly_members",pattern:/\b(mensalistas?|mensalidades)\b.*\b(ativos?|venc|quem|lista)\b/},
  {tool:"get_products",pattern:/\b(estoque|produtos?)\b.*\b(tem|lista|quais|preco|quanto|faltando)\b/},
  {tool:"get_payment_methods",pattern:/\b(formas? de pagamento|taxas? do cartao|taxas? cadastradas)\b/},
  {tool:"get_services",pattern:/\b(servicos?)\b.*\b(quais|lista|tem|preco|duracao|quanto)\b|\b(quais|lista|tem|preco|duracao|quanto)\b.*\b(servicos?)\b/},
];

export function isShortHelpContinuation(question:string, previous:HelpIntent|null):boolean {
  if (!previous) return false;
  const clean=normalizeHelp(question);
  return /^(e |so |agora |do |da |depois |antes |mostra |me mostra |quantos |quanto |essa |esse |semana passada|hoje|ontem)/.test(clean) && clean.split(" ").length<=7 || Boolean(periodFromSpeech(question)&&clean.split(" ").length<=4);
}

export function fallbackHelpIntent(question:string, previous:HelpIntent|null, owner:boolean, now=new Date()):HelpIntent|null {
  const clean=normalizeHelp(question);
  if (/\b(onde|ensina|significa)\b|^como (faco|mudo|registro|funciona|crio)\b/.test(clean) && !/\b(esta errado|nao funciona)\b/.test(clean)) return null;
  if (isShortHelpContinuation(question,previous)) return continueHelpIntent(question,previous!,now);
  const detected=READ_DOMAINS.find(item=>item.pattern.test(clean))?.tool;
  const parsed=parseReport(question,owner,now);
  const tool:HelpToolId|undefined=detected??(parsed&&!('clarification' in parsed)? parsed.person?"get_employee_results":"get_revenue":undefined);
  if (!tool) return null;
  const period=periodFromSpeech(question,now)??(parsed&&!('clarification' in parsed)?{start:parsed.start,end:parsed.end}:null)??{start:appDate(now),end:appDate(now)};
  const person=parsed&&!('clarification' in parsed)?parsed.person??"":"";
  return normalizeHelpIntent({tool,...period,scope:parsed&&!('clarification' in parsed)?parsed.scope:owner?"shop":"self",metric:parsed&&!('clarification' in parsed)?parsed.metric:"summary",person,afterTime:afterTimeFromSpeech(question),atTime:atTimeFromSpeech(question),service:"",client:""});
}

// Protect high-confidence distinctions (appointment versus completed record)
// even if the model returns an otherwise well-formed but mismatched tool ID.
export function reconcileHelpIntent(question:string, interpreted:HelpIntent, owner:boolean, now=new Date()):HelpIntent {
  const explicit=fallbackHelpIntent(question,null,owner,now);
  if (!explicit) return interpreted;
  const agendaTools:HelpToolId[]=["get_appointments","get_next_appointment","get_available_slots"];
  const tool=agendaTools.includes(explicit.tool)||HELP_TOOLS[explicit.tool].domain!==HELP_TOOLS[interpreted.tool].domain?explicit.tool:interpreted.tool;
  const period=periodFromSpeech(question,now);
  const time=afterTimeFromSpeech(question);
  const exact=atTimeFromSpeech(question);
  const clean=normalizeHelp(question);
  const mentionedPerson=explicit.person&&["get_revenue","get_employee_results","get_commission_breakdown"].includes(explicit.tool)?{person:explicit.person,scope:"self" as const}:{};
  const shopScope=/\b(barbearia|equipe|todos|geral)\b/.test(clean)?{person:"",scope:"shop" as const}:{};
  const moneyMetric=/\b(reais|dinheiro|faturamento|comissao|lucro|valor)\b/.test(clean)?{metric:"summary" as const}:{};
  return {...interpreted,tool,...mentionedPerson,...shopScope,...moneyMetric,...(period??{}),...(time?{afterTime:time,atTime:""}:{}),...(exact?{atTime:exact,afterTime:""}:{})};
}
