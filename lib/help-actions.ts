export type HelpScheduleChange = {
  days: number[];
  enabled: "on" | "off" | "";
  openingTime: string;
  closingTime: string;
};

export type HelpActionProposal = {
  kind: "service" | "plan" | "agenda" | "team-hours" | "payment" | "public-booking-link";
  mode: "create" | "update" | "";
  target: string;
  name: string;
  serviceName: string;
  priceCents: number;
  durationMinutes: number;
  monthlyValueCents: number;
  maxUses: number;
  barberPayoutCents: number;
  feeBps: number;
  useServiceDuration: "on" | "off" | "";
  scheduleChanges: HelpScheduleChange[];
  summary: string;
};

export type ParsedHelpAction = { action: HelpActionProposal } | { clarification: string } | null;

function normalizeHelp(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const blank = (kind: HelpActionProposal["kind"]): HelpActionProposal => ({
  kind,
  mode: "",
  target: "",
  name: "",
  serviceName: "",
  priceCents: 0,
  durationMinutes: 0,
  monthlyValueCents: 0,
  maxUses: 0,
  barberPayoutCents: 0,
  feeBps: 0,
  useServiceDuration: "",
  scheduleChanges: [],
  summary: "",
});

function moneyCents(text: string) {
  const match = text.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?|conto(?:s)?)?/i);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : 0;
}

function moneyAfter(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match?.[1]) return 0;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : 0;
}

function percentageBps(text: string) {
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)\s*%/);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) : 0;
}

function durationMinutes(text: string) {
  const hourAndMinute = text.match(/(\d+)\s*(?:h|hora(?:s)?)\s*(?:e\s*)?(\d{1,2})?\s*(?:min(?:uto)?s?)?/i);
  if (hourAndMinute) return Number(hourAndMinute[1]) * 60 + Number(hourAndMinute[2] || 0);
  const minutes = text.match(/(\d{1,3})\s*(?:min|minuto|minutos)\b/i);
  return minutes ? Number(minutes[1]) : 0;
}

function normalizeTime(raw: string | undefined) {
  if (!raw) return "";
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::|h)?(\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const dayNames: Array<[RegExp, number]> = [
  [/\bdomingo\b/i, 0],
  [/\bsegunda(?:-feira)?\b/i, 1],
  [/\bter[cç]a(?:-feira)?\b/i, 2],
  [/\bquarta(?:-feira)?\b/i, 3],
  [/\bquinta(?:-feira)?\b/i, 4],
  [/\bsexta(?:-feira)?\b/i, 5],
  [/\bs[aá]bado\b/i, 6],
];

function dayNumber(name: string) {
  return dayNames.find(([pattern]) => pattern.test(name))?.[1] ?? -1;
}

function daysIn(text: string) {
  const clean = normalizeHelp(text);
  if (/todos os dias|todo dia/.test(clean)) return [0,1,2,3,4,5,6];
  if (/segunda (?:a|ate) sabado/.test(clean)) return [1,2,3,4,5,6];
  if (/segunda (?:a|ate) sexta/.test(clean)) return [1,2,3,4,5];
  const found = dayNames.filter(([pattern]) => pattern.test(text)).map(([,day]) => day);
  return [...new Set(found)];
}

function timeRange(text: string) {
  const range = text.match(/(?:das?|de)\s*(\d{1,2}(?::\d{2})?|\d{1,2}h\d{0,2})\s*(?:às?|as?|até|ate|-)\s*(\d{1,2}(?::\d{2})?|\d{1,2}h\d{0,2})/i)
    ?? text.match(/\b(\d{1,2}(?::\d{2})?|\d{1,2}h\d{0,2})\s*[-–]\s*(\d{1,2}(?::\d{2})?|\d{1,2}h\d{0,2})\b/i);
  if (range) return { openingTime: normalizeTime(range[1]), closingTime: normalizeTime(range[2]) };
  const opens = text.match(/(?:abre|entra|come[cç]a)\s*(?:[àa]s?\s*)?(\d{1,2}(?::\d{2})?|\d{1,2}h\d{0,2})/i);
  const closes = text.match(/(?:fecha|sai|termina)\s*(?:[àa]s?\s*)?(\d{1,2}(?::\d{2})?|\d{1,2}h\d{0,2})/i);
  return { openingTime: normalizeTime(opens?.[1]), closingTime: normalizeTime(closes?.[1]) };
}

function splitScheduleSegments(text: string) {
  const candidates = text.split(/\s+(?:e|,|;|depois)\s+/i).map((item) => item.trim()).filter(Boolean);
  const segments = candidates.filter((item) => daysIn(item).length > 0 || /todos os dias|todo dia/i.test(item));
  return segments.length ? segments : [text];
}

export function parseScheduleChanges(text: string): HelpScheduleChange[] {
  const result: HelpScheduleChange[] = [];
  for (const segment of splitScheduleSegments(text)) {
    const days = daysIn(segment);
    const { openingTime, closingTime } = timeRange(segment);
    const clean = normalizeHelp(segment);
    const disabled = /folga|nao trabalha|nao atende|fechado|fecha o dia/.test(clean);
    const enabled = disabled ? "off" : /trabalha|atende|aberto|abre|expediente|das? \d|de \d/.test(clean) ? "on" : "";
    if (days.length || openingTime || closingTime || disabled) result.push({ days, enabled, openingTime, closingTime });
  }
  return result;
}

function actionVerb(clean: string) {
  return /\b(cria|criar|cadastre|cadastrar|adiciona|adicionar|muda|mudar|altera|alterar|ajusta|ajustar|coloca|colocar|ativa|ativar|desativa|desativar|configura|configurar|define|definir)\b/.test(clean);
}

function serviceNameFrom(text: string) {
  const explicit = text.match(/(?:servi[cç]o|servico)\s+(.+?)(?=\s+(?:de|por|a|custa|valor|pre[cç]o|dura|demora|com|r\$)\b|\s+\d+(?:[.,]\d+)?\s*(?:reais?|conto|min|hora)|$)/i);
  if (explicit?.[1]) return explicit[1].trim().replace(/^(?:de|do|da)\s+/i, "");
  const mine = text.match(/(?:meu|minha)\s+([\p{L}][\p{L}\s+&-]*?)(?=\s+(?:custa|vale|dura|demora|fica|vai)\b)/iu);
  return mine?.[1]?.trim() ?? "";
}

function teamNameFrom(text: string) {
  const explicit = text.match(/(?:barbeiro|funcion[aá]rio|profissional)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)/iu);
  if (explicit?.[1]) return explicit[1].trim();
  const beforeWork = text.match(/^\s*([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)\s+(?:trabalha|atende|entra|sai|folga)\b/iu);
  return beforeWork?.[1]?.trim() ?? "";
}

function parseServiceAction(text: string, clean: string): ParsedHelpAction {
  if (!actionVerb(clean) && !/\b(custa|dura|demora)\b/.test(clean)) return null;
  if (!/\bservico\b|\bcorte\b|\bbarba\b|\bsobrancelha\b/.test(clean)) return null;
  const create = /\b(cria|criar|cadastre|cadastrar|adiciona|adicionar|novo|nova)\b/.test(clean);
  const name = serviceNameFrom(text);
  const price = moneyAfter(text, /(?:r\$\s*|custa\s*|valor(?:\s+de)?\s*|pre[cç]o(?:\s+de)?\s*|por\s+)(\d+(?:[.,]\d{1,2})?)/i) || moneyCents(text);
  const duration = durationMinutes(text);
  if (!name) return { clarification: create ? "Qual é o nome do serviço que você quer criar?" : "Qual serviço você quer alterar?" };
  if (create && !price) return { clarification: `Qual será o preço do serviço ${name}?` };
  if (create && !duration) return { clarification: `Quanto tempo o serviço ${name} leva? Pode falar, por exemplo, 45 minutos.` };
  const action = blank("service");
  action.mode = create ? "create" : "update";
  action.target = create ? "" : name;
  action.name = name;
  action.priceCents = price;
  action.durationMinutes = duration;
  action.summary = create ? `Criar o serviço ${name}` : `Atualizar o serviço ${name}`;
  return { action };
}

function parsePlanAction(text: string, clean: string): ParsedHelpAction {
  if (!actionVerb(clean) || !/\bplano\b/.test(clean)) return null;
  const create = /\b(cria|criar|cadastre|cadastrar|adiciona|adicionar)\b/.test(clean);
  const uses = Number(text.match(/(\d+)\s*(?:cortes?|usos?|vezes)/i)?.[1] || 0);
  const monthly = moneyAfter(text, /(?:por|mensalidade(?:\s+de)?|valor(?:\s+de)?|r\$\s*)(\d+(?:[.,]\d{1,2})?)/i);
  const payout = moneyAfter(text, /(?:comiss[aã]o|repasse|paga(?:r)?\s+(?:ao|pro)\s+barbeiro)\s*(?:de\s*)?(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  const service = /\bcortes?\b/.test(clean) ? "corte" : text.match(/(?:inclui|servi[cç]o)\s+([\p{L}\s+&-]+)/iu)?.[1]?.trim() ?? "";
  const nameMatch = text.match(/plano\s+(.+?)(?=\s+(?:de\s+)?\d+\s*(?:cortes?|usos?)|\s+(?:por|r\$|mensalidade|inclui|comiss[aã]o)\b|$)/i);
  const name = nameMatch?.[1]?.trim() || (uses ? `Plano ${uses} usos` : "");
  if (create && !uses) return { clarification: "Quantos usos por mês esse plano terá?" };
  if (create && !monthly) return { clarification: "Qual será o valor mensal desse plano?" };
  if (create && !service) return { clarification: "Qual serviço esse plano inclui?" };
  if (create && !payout) return { clarification: "Quanto a barbearia repassa ao barbeiro por cada uso desse plano?" };
  const action = blank("plan");
  action.mode = create ? "create" : "update";
  action.target = create ? "" : name;
  action.name = name;
  action.serviceName = service;
  action.monthlyValueCents = monthly;
  action.maxUses = uses;
  action.barberPayoutCents = payout;
  action.summary = create ? `Criar ${name || "novo plano"}` : `Atualizar ${name || "plano"}`;
  return { action };
}

function parsePaymentAction(text: string, clean: string): ParsedHelpAction {
  if (!actionVerb(clean) && !/\btaxa\b/.test(clean)) return null;
  if (!/\bforma de pagamento\b|\btaxa\b/.test(clean)) return null;
  const create = /\b(cria|criar|cadastre|cadastrar|adiciona|adicionar)\b/.test(clean);
  const explicit = text.match(/(?:forma de pagamento|taxa (?:do|da))\s+([\p{L}\s-]+?)(?=\s+(?:de|para|pra|em|fica|vai|\d)|$)/iu);
  const name = explicit?.[1]?.trim() ?? "";
  const fee = percentageBps(text);
  if (!name) return { clarification: create ? "Qual é o nome da forma de pagamento?" : "Qual forma de pagamento você quer alterar?" };
  if (!/%/.test(text)) return { clarification: `Qual taxa percentual devo usar para ${name}?` };
  const action = blank("payment");
  action.mode = create ? "create" : "update";
  action.target = create ? "" : name;
  action.name = name;
  action.feeBps = fee;
  action.summary = create ? `Criar a forma de pagamento ${name}` : `Alterar a taxa de ${name}`;
  return { action };
}

function parseAgendaAction(text: string, clean: string): ParsedHelpAction {
  const wantsDuration = /\bduracao\b.*\b(servico|agenda)|\b(servico|agenda)\b.*\bduracao\b/.test(clean);
  const schedule = parseScheduleChanges(text);
  const mentionsShopSchedule = /\b(barbearia|agenda|expediente|horario|horarios)\b/.test(clean) && schedule.length > 0;
  if (!actionVerb(clean) && !mentionsShopSchedule) return null;
  if (!wantsDuration && !mentionsShopSchedule) return null;
  const action = blank("agenda");
  if (wantsDuration) {
    action.useServiceDuration = /\b(desativa|desativar|nao usar|sem duracao)\b/.test(clean) ? "off" : "on";
  }
  action.scheduleChanges = schedule;
  action.summary = wantsDuration && schedule.length ? "Atualizar a duração inteligente e os horários da barbearia" : wantsDuration ? "Atualizar a duração inteligente da agenda" : "Atualizar os horários da barbearia";
  return { action };
}

function parseTeamHoursAction(text: string, clean: string): ParsedHelpAction {
  if (!/\b(trabalha|atende|entra|sai|folga|horario)\b/.test(clean)) return null;
  const member = teamNameFrom(text);
  if (!member) return null;
  const schedule = parseScheduleChanges(text);
  if (!schedule.length) return null;
  const action = blank("team-hours");
  action.target = member;
  action.scheduleChanges = schedule;
  action.summary = `Atualizar os horários de ${member}`;
  return { action };
}

export function parseHelpAction(question: string, owner: boolean): ParsedHelpAction {
  const text = question.trim();
  const clean = normalizeHelp(text);
  if (!text) return null;

  if (/\b(link|url)\b.*\b(agendamento|agenda)\b|\b(agendamento|agenda)\b.*\b(link|url)\b/.test(clean)) {
    const action = blank("public-booking-link");
    action.summary = "Mostrar o link público de agendamento";
    return { action };
  }

  const team = parseTeamHoursAction(text, clean);
  const agenda = parseAgendaAction(text, clean);
  const plan = parsePlanAction(text, clean);
  const payment = parsePaymentAction(text, clean);
  const service = parseServiceAction(text, clean);
  const parsed = team ?? agenda ?? plan ?? payment ?? service;
  if (!parsed) return null;
  if (!owner) return { clarification: "Essa alteração só pode ser feita pelo proprietário da barbearia." };
  return parsed;
}

export function normalizeModelAction(value: unknown): HelpActionProposal | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<HelpActionProposal>;
  if (!["service","plan","agenda","team-hours","payment","public-booking-link"].includes(String(raw.kind))) return null;
  const action = blank(raw.kind as HelpActionProposal["kind"]);
  action.mode = raw.mode === "create" || raw.mode === "update" ? raw.mode : "";
  action.target = typeof raw.target === "string" ? raw.target.trim().slice(0,120) : "";
  action.name = typeof raw.name === "string" ? raw.name.trim().slice(0,120) : "";
  action.serviceName = typeof raw.serviceName === "string" ? raw.serviceName.trim().slice(0,120) : "";
  action.priceCents = Number.isFinite(Number(raw.priceCents)) ? Math.max(0, Math.round(Number(raw.priceCents))) : 0;
  action.durationMinutes = Number.isFinite(Number(raw.durationMinutes)) ? Math.max(0, Math.round(Number(raw.durationMinutes))) : 0;
  action.monthlyValueCents = Number.isFinite(Number(raw.monthlyValueCents)) ? Math.max(0, Math.round(Number(raw.monthlyValueCents))) : 0;
  action.maxUses = Number.isFinite(Number(raw.maxUses)) ? Math.max(0, Math.round(Number(raw.maxUses))) : 0;
  action.barberPayoutCents = Number.isFinite(Number(raw.barberPayoutCents)) ? Math.max(0, Math.round(Number(raw.barberPayoutCents))) : 0;
  action.feeBps = Number.isFinite(Number(raw.feeBps)) ? Math.max(0, Math.round(Number(raw.feeBps))) : 0;
  action.useServiceDuration = raw.useServiceDuration === "on" || raw.useServiceDuration === "off" ? raw.useServiceDuration : "";
  action.scheduleChanges = Array.isArray(raw.scheduleChanges) ? raw.scheduleChanges.slice(0,7).map((item) => {
    const candidate = item as Partial<HelpScheduleChange>;
    return {
      days: Array.isArray(candidate.days) ? candidate.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [],
      enabled: candidate.enabled === "on" || candidate.enabled === "off" ? candidate.enabled : "",
      openingTime: normalizeTime(candidate.openingTime),
      closingTime: normalizeTime(candidate.closingTime),
    };
  }) : [];
  action.summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0,240) : "";
  return action;
}
