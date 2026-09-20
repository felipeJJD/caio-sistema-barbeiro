"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData } from "../../db/dashboard";
import { appDate } from "../../lib/app-date";
import { SUPPORT_WHATSAPP_URL } from "../../lib/support";
import { AppIcon } from "./app-icon";

import { destinationAllowed, HELP_MESSAGE_LIMIT, requestedHelpAction, type HelpDestination, type HelpReply } from "../../lib/help-guide";
import type { HelpActionProposal, HelpScheduleChange } from "../../lib/help-actions";
import { HelpVoiceBubble, HelpVoiceWave, formatHelpVoiceTime, useHelpVoiceRecorder, type HelpVoicePayload } from "./help-voice";

type VoiceAttachment = { url: string; durationSeconds: number; transcript: string; showTranscript: boolean; status: "processing" | "ready" | "error" };
type Message = { id: number; role: "user" | "assistant"; text: string; destination?: HelpDestination; suggestions?: string[]; retry?: string; link?: { label: string; url: string }; audio?: VoiceAttachment };
type Post = (body: Record<string, string | number | boolean>, success: string) => Promise<boolean>;
type ActionKind = "record" | "appointment" | "expense";
type ActionField = "recordType" | "clientName" | "membershipClient" | "service" | "payment" | "barber" | "appointmentDate" | "appointmentTime" | "expenseDescription" | "expenseValue" | "expenseType" | "expensePaid";

type ActionDraft = {
  kind: ActionKind;
  occurredAt?: string;
  recordType?: "Avulso" | "Mensalista";
  clientName?: string;
  membershipClientId?: number;
  barberId?: number;
  serviceId?: number;
  paymentMethodId?: number;
  appointmentDate?: string;
  appointmentTime?: string;
  phone?: string;
  description?: string;
  valueCents?: number;
  expenseType?: "Fixa" | "Variável";
  paid?: boolean;
};

type Choice = { label: string; value: string };
const helpSuggestions = ["O que o app faz?", "Como registrar um corte?", "Quanto eu fiz hoje?"];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isoDate(offset = 0) {
  return appDate(new Date(), offset);
}

function displayDate(value?: string) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "";
}

function money(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function parseDate(text: string) {
  const clean = normalize(text);
  if (clean.includes("depois de amanha")) return isoDate(2);
  if (clean.includes("amanha")) return isoDate(1);
  if (clean.includes("hoje")) return isoDate();
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const brazilian = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!brazilian) return undefined;
  const currentYear = isoDate().slice(0, 4);
  const year = brazilian[3] ? (brazilian[3].length === 2 ? `20${brazilian[3]}` : brazilian[3]) : currentYear;
  return `${year}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
}

function parseTime(text: string) {
  const withMinutes = text.match(/\b(\d{1,2})(?::|h)(\d{2})\b/i);
  const hourOnly = text.match(/(?:\bàs?\b|\bas\b)\s*(\d{1,2})(?:\s*horas?)?\b/i);
  const hour = Number(withMinutes?.[1] ?? hourOnly?.[1]);
  const minutes = Number(withMinutes?.[2] ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseValue(text: string) {
  const match = text.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i) ?? text.match(/(\d+(?:[.,]\d{1,2})?)\s*reais?\b/i) ?? text.trim().match(/^(\d+(?:[.,]\d{1,2})?)$/);
  if (!match) return undefined;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : undefined;
}

function matchNamed<T extends { id: number; name: string }>(items: T[], text: string) {
  const clean = normalize(text);
  return [...items].sort((left, right) => right.name.length - left.name.length).find((item) => clean.includes(normalize(item.name)))?.id;
}

function extractClientName(text: string) {
  const match = text.match(/\bcliente\s+([\p{L}][\p{L}\s'-]*?)(?=\s+(?:com|para|no|na|às|as|dia|hoje|amanhã|amanha|corte|barba|pix|dinheiro|débito|debito|crédito|credito)\b|$)/iu);
  return match?.[1]?.trim();
}

function actionLabel(kind: ActionKind) {
  if (kind === "record") return "Registrar atendimento";
  if (kind === "appointment") return "Agendar horário";
  return "Criar despesa";
}

function promptFor(field: ActionField, kind: ActionKind) {
  const prompts: Record<ActionField, string> = {
    recordType: "Este atendimento é avulso ou de um mensalista?",
    clientName: "Qual é o nome do cliente?",
    membershipClient: "Qual mensalista foi atendido?",
    service: kind === "appointment" ? "Qual serviço será agendado?" : "Qual serviço foi realizado?",
    payment: "Como o cliente pagou?",
    barber: kind === "appointment" ? "Com qual barbeiro será o horário?" : "Qual barbeiro fez o atendimento?",
    appointmentDate: "Para qual dia? Diga hoje, amanhã ou uma data como 18/08.",
    appointmentTime: "Qual é o horário? Por exemplo: 17:40.",
    expenseDescription: "Qual é a descrição da despesa? Por exemplo: produtos de limpeza.",
    expenseValue: "Qual foi o valor da despesa?",
    expenseType: "Essa despesa é fixa ou variável?",
    expensePaid: "Ela já foi paga ou ficou pendente?",
  };
  return prompts[field];
}

export function HelpAssistant({ viewer, data, post, onNavigate }: { viewer: DashboardData["viewer"]; data: DashboardData; post: Post; onNavigate:(destination:HelpDestination)=>void }) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [input, setInput] = useState("");
  const [answerPending, setAnswerPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [activeField, setActiveField] = useState<ActionField | null>(null);
  const [configAction, setConfigAction] = useState<HelpActionProposal | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: "assistant", text: "Olá! Posso tirar dúvidas, mostrar onde fazer algo e consultar seus resultados. O que você precisa?" }]);
  const nextMessageId = useRef(2);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const draftTextRef = useRef("");
  const requestInFlight = useRef(false);
  const saveInFlight = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioUrlsRef = useRef(new Set<string>());
  const voice = useHelpVoiceRecorder({ onSend: sendVoiceBlob, onError: (message) => addMessage("assistant", message) });
  const closeVoice = voice.close;
  const busy = answerPending || saving || voiceUploading;
  function updateInput(text:string) { draftTextRef.current = text; setInput(text); }
  const openPanel = useCallback(() => { setRendered(true); setOpen(true); }, []);
  const closeHelp = useCallback(() => {
    closeVoice();
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
  }, [closeVoice]);

  useEffect(() => {
    if (open || !rendered) return;
    const timeout = window.setTimeout(() => setRendered(false), 190);
    return () => window.clearTimeout(timeout);
  }, [open, rendered]);

  useEffect(() => {
    if (open && scrollRef.current) {
      const scroller = scrollRef.current;
      window.requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
    }
  }, [messages, open, activeField, actionDraft]);

  useEffect(() => {
    if (!rendered) return;
    const viewport = window.visualViewport;
    const sync = () => {
      const panel = panelRef.current;
      if (!panel) return;
      panel.style.setProperty("--help-visible-height", `${viewport?.height ?? window.innerHeight}px`);
      panel.style.setProperty("--help-visible-height-half", `${(viewport?.height ?? window.innerHeight) / 2}px`);
      panel.style.setProperty("--help-visible-top", `${viewport?.offsetTop ?? 0}px`);
      if (document.activeElement === inputRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [rendered]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 48), 180)}px`;
  }, [input, open]);

  useEffect(() => {
    window.addEventListener("cortou-anotou:open-assistant", openPanel);
    return () => window.removeEventListener("cortou-anotou:open-assistant", openPanel);
  }, [openPanel]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled)');
        if (controls?.length) {
          const first = controls[0], last = controls[controls.length-1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        closeHelp();
      }
    };
    const closeForMenu = () => { closeVoice(); setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("cortou-anotou:open-navigation", closeForMenu);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("cortou-anotou:open-navigation", closeForMenu);
    };
  }, [open, closeHelp, closeVoice]);

  useEffect(() => () => {
    for (const url of audioUrlsRef.current) URL.revokeObjectURL(url);
    audioUrlsRef.current.clear();
  }, []);

  function addMessage(role: Message["role"], text: string, extra:Partial<Message> = {}) {
    const message = { ...extra, id: nextMessageId.current++, role, text };
    setMessages((current) => [...current, message]);
  }

  function initialDraft(kind: ActionKind, command = ""): ActionDraft {
    const clean = normalize(command);
    const activeTeam = data.team.filter((item) => item.active);
    const activeServices = data.services.filter((item) => item.active);
    const ownBarberId = viewer.isOwner ? matchNamed(activeTeam, command) : viewer.teamMemberId;
    const common = { kind, barberId: ownBarberId, serviceId: matchNamed(activeServices, command) } as ActionDraft;
    if (kind === "record") {
      const recordType = clean.includes("mensalista") || clean.includes("assinatura") ? "Mensalista" : clean.includes("avulso") ? "Avulso" : undefined;
      const membershipClientId = recordType === "Mensalista" ? matchNamed(data.clients.filter((item) => item.status === "Ativo"), command) : undefined;
      return { ...common, occurredAt: parseDate(command) ?? isoDate(), recordType, clientName: recordType === "Avulso" ? extractClientName(command) : undefined, membershipClientId, paymentMethodId: recordType === "Mensalista" ? data.paymentMethods[0]?.id : matchNamed(data.paymentMethods, command) };
    }
    if (kind === "appointment") {
      const phone = command.match(/(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/)?.[0];
      return { ...common, clientName: extractClientName(command), appointmentDate: parseDate(command), appointmentTime: parseTime(command), phone };
    }
    const descriptionMatch = command.match(/(?:despesa|gastei|paguei|comprei)(?:\s+(?:com|de|em))?\s+(.+?)(?=\s+(?:de\s+)?(?:r\$\s*)?\d|$)/i);
    return { kind, occurredAt: parseDate(command) ?? isoDate(), description: descriptionMatch?.[1]?.trim(), valueCents: parseValue(command), expenseType: clean.includes("fixa") ? "Fixa" : clean.includes("variavel") ? "Variável" : undefined, paid: clean.includes("pendente") || clean.includes("a pagar") ? false : /\b(gastei|paguei|comprei)\b/.test(clean) ? true : undefined };
  }

  function nextField(draft: ActionDraft): ActionField | null {
    if (draft.kind === "record") {
      if (!draft.recordType) return "recordType";
      if (draft.recordType === "Mensalista" && !draft.membershipClientId) return "membershipClient";
      if (draft.recordType === "Avulso" && !draft.clientName) return "clientName";
      if (draft.recordType === "Avulso" && !draft.serviceId) return "service";
      if (draft.recordType === "Avulso" && !draft.paymentMethodId) return "payment";
      if (!draft.barberId) return "barber";
      return null;
    }
    if (draft.kind === "appointment") {
      if (!draft.clientName) return "clientName";
      if (!draft.appointmentDate) return "appointmentDate";
      if (!draft.appointmentTime) return "appointmentTime";
      if (!draft.serviceId) return "service";
      if (!draft.barberId) return "barber";
      return null;
    }
    if (!draft.description) return "expenseDescription";
    if (!draft.valueCents) return "expenseValue";
    if (!draft.expenseType) return "expenseType";
    if (draft.paid === undefined) return "expensePaid";
    return null;
  }

  function continueAction(nextDraft: ActionDraft) {
    const field = nextField(nextDraft);
    setActionDraft(nextDraft);
    setActiveField(field);
    if (field) addMessage("assistant", promptFor(field, nextDraft.kind));
    else addMessage("assistant", "Pronto. Confira os dados abaixo. Eu só vou salvar depois da sua confirmação.");
  }

  function startAction(kind: ActionKind, command = "", showUserMessage = true) {
    if (kind === "expense" && !viewer.isOwner) {
      if (showUserMessage) addMessage("user", actionLabel(kind));
      addMessage("assistant", "Somente o proprietário pode registrar despesas. Posso ajudar você a registrar um atendimento ou agendar um horário.");
      return;
    }
    if (showUserMessage) addMessage("user", actionLabel(kind));
    continueAction(initialDraft(kind, command));
  }

  function findByAnswer<T extends { id: number; name: string }>(items: T[], answer: string) {
    const clean = normalize(answer);
    return items.find((item) => normalize(item.name) === clean) ?? items.find((item) => normalize(item.name).includes(clean) || clean.includes(normalize(item.name)));
  }

  function applyAnswer(field: ActionField, answer: string) {
    if (!actionDraft) return;
    const clean = normalize(answer);
    let next = { ...actionDraft };
    let error = "";
    if (field === "recordType") {
      if (clean.includes("mensal") || clean.includes("assinatura")) next = { ...next, recordType: "Mensalista", clientName: undefined, serviceId: undefined, paymentMethodId: data.paymentMethods[0]?.id };
      else if (clean.includes("avulso")) next = { ...next, recordType: "Avulso", membershipClientId: undefined, paymentMethodId: undefined };
      else error = "Escolha Avulso ou Mensalista.";
    } else if (field === "clientName") {
      if (answer.trim().length >= 2) next.clientName = answer.trim(); else error = "Digite o nome do cliente.";
    } else if (field === "membershipClient") {
      const item = findByAnswer(data.clients.filter((client) => client.status === "Ativo"), answer);
      if (item) next.membershipClientId = item.id; else error = "Não encontrei esse mensalista ativo. Escolha um nome da lista.";
    } else if (field === "service") {
      const item = findByAnswer(data.services.filter((service) => service.active), answer);
      if (item) next.serviceId = item.id; else error = "Não encontrei esse serviço. Escolha uma opção da lista.";
    } else if (field === "payment") {
      const item = findByAnswer(data.paymentMethods, answer);
      if (item) next.paymentMethodId = item.id; else error = "Não encontrei essa forma de pagamento. Escolha uma opção da lista.";
    } else if (field === "barber") {
      const item = findByAnswer(data.team.filter((member) => member.active), answer);
      if (item) next.barberId = item.id; else error = "Não encontrei esse barbeiro. Escolha uma opção da lista.";
    } else if (field === "appointmentDate") {
      const value = parseDate(answer);
      if (value) next.appointmentDate = value; else error = "Diga hoje, amanhã ou informe uma data como 18/08.";
    } else if (field === "appointmentTime") {
      const value = parseTime(answer);
      if (value) next.appointmentTime = value; else error = "Informe um horário válido, como 17:40.";
    } else if (field === "expenseDescription") {
      if (answer.trim().length >= 2) next.description = answer.trim(); else error = "Digite uma descrição para a despesa.";
    } else if (field === "expenseValue") {
      const value = parseValue(answer);
      if (value) next.valueCents = value; else error = "Informe um valor maior que zero, como 50 reais.";
    } else if (field === "expenseType") {
      if (clean.includes("fixa")) next.expenseType = "Fixa";
      else if (clean.includes("variavel")) next.expenseType = "Variável";
      else error = "Escolha Fixa ou Variável.";
    } else if (field === "expensePaid") {
      if (clean.includes("paga") || clean.includes("pago") || clean === "sim") next.paid = true;
      else if (clean.includes("pendente") || clean.includes("a pagar") || clean === "nao") next.paid = false;
      else error = "Escolha Pago ou Pendente.";
    }
    if (error) addMessage("assistant", error);
    else continueAction(next);
  }

  function choicesFor(field: ActionField | null): Choice[] {
    if (!field) return [];
    if (field === "recordType") return [{ label: "Avulso", value: "Avulso" }, { label: "Mensalista", value: "Mensalista" }];
    if (field === "membershipClient") return data.clients.filter((item) => item.status === "Ativo").map((item) => ({ label: `${item.name} · ${item.remaining} usos`, value: item.name }));
    if (field === "service") return data.services.filter((item) => item.active).map((item) => ({ label: item.name, value: item.name }));
    if (field === "payment") return data.paymentMethods.map((item) => ({ label: item.name, value: item.name }));
    if (field === "barber") return data.team.filter((item) => item.active).map((item) => ({ label: item.name, value: item.name }));
    if (field === "appointmentDate") return [{ label: "Hoje", value: "hoje" }, { label: "Amanhã", value: "amanhã" }];
    if (field === "expenseType") return [{ label: "Variável", value: "Variável" }, { label: "Fixa", value: "Fixa" }];
    if (field === "expensePaid") return [{ label: "Já foi paga", value: "pago" }, { label: "Pendente", value: "pendente" }];
    return [];
  }

  const weekdayLabel = (day: number) => ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][day] ?? "Dia";

  function sameName(value: string, candidate: string) {
    const left = normalize(value);
    const right = normalize(candidate);
    if (!left || !right) return false;
    return left === right || right.includes(left) || left.includes(right);
  }

  function mergeSchedule(base: DashboardData["agendaSettings"]["weeklyHours"], changes: HelpScheduleChange[]) {
    const next = base.map((row) => ({ ...row }));
    for (const change of changes) {
      const targets = change.days.length ? change.days : next.filter((row) => row.enabled).map((row) => row.day);
      for (const day of targets) {
        const row = next.find((candidate) => candidate.day === day);
        if (!row) continue;
        if (change.enabled === "on") row.enabled = true;
        if (change.enabled === "off") row.enabled = false;
        if (change.openingTime) row.openingTime = change.openingTime;
        if (change.closingTime) row.closingTime = change.closingTime;
      }
    }
    for (const row of next) {
      if (row.enabled && row.openingTime >= row.closingTime) throw new Error(`${weekdayLabel(row.day)} ficou com horário inválido: ${row.openingTime}–${row.closingTime}.`);
    }
    return next;
  }

  function scheduleSummary(changes: HelpScheduleChange[]) {
    return changes.map((change) => {
      const days = change.days.length ? change.days.map(weekdayLabel).join(", ") : "Dias ativos";
      if (change.enabled === "off") return `${days}: folga/fechado`;
      const hours = change.openingTime && change.closingTime ? `${change.openingTime}–${change.closingTime}`
        : change.openingTime ? `abre ${change.openingTime}`
        : change.closingTime ? `fecha ${change.closingTime}` : "";
      return `${days}${hours ? `: ${hours}` : ""}`;
    }).join(" · ");
  }

  function configSummaryRows(action: HelpActionProposal) {
    if (action.kind === "service") return [
      ["Ação", action.mode === "create" ? "Criar serviço" : "Editar serviço"],
      ["Serviço", action.name || action.target],
      ["Preço", action.priceCents ? money(action.priceCents) : "Manter atual"],
      ["Duração", action.durationMinutes ? `${action.durationMinutes} min` : "Manter atual"],
    ];
    if (action.kind === "plan") return [
      ["Ação", action.mode === "create" ? "Criar plano" : "Editar plano"],
      ["Plano", action.name || action.target],
      ["Serviço", action.serviceName || "Manter atual"],
      ["Mensalidade", action.monthlyValueCents ? money(action.monthlyValueCents) : "Manter atual"],
      ["Usos", action.maxUses ? String(action.maxUses) : "Manter atual"],
      ["Repasse/uso", action.barberPayoutCents ? money(action.barberPayoutCents) : "Manter atual"],
    ];
    if (action.kind === "payment") return [
      ["Ação", action.mode === "create" ? "Criar pagamento" : "Editar pagamento"],
      ["Pagamento", action.name || action.target],
      ["Taxa", `${(action.feeBps / 100).toFixed(2).replace(".", ",")}%`],
    ];
    if (action.kind === "team-hours") return [
      ["Ação", "Horários do profissional"],
      ["Profissional", action.target],
      ["Mudança", scheduleSummary(action.scheduleChanges)],
    ];
    if (action.kind === "agenda") return [
      ["Ação", "Configurar agenda"],
      ["Duração inteligente", action.useServiceDuration === "on" ? "Ativar" : action.useServiceDuration === "off" ? "Desativar" : "Manter atual"],
      ["Horários", action.scheduleChanges.length ? scheduleSummary(action.scheduleChanges) : "Manter atuais"],
    ];
    return [["Ação", action.summary || "Configuração"]];
  }

  async function confirmConfigAction() {
    if (!configAction || saveInFlight.current) return;
    if (!viewer.isOwner) {
      addMessage("assistant", "Essa alteração só pode ser feita pelo proprietário.");
      setConfigAction(null);
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    try {
      let ok = false;
      if (configAction.kind === "service") {
        const current = configAction.mode === "update"
          ? data.services.find((item) => sameName(configAction.target || configAction.name, item.name))
          : undefined;
        if (configAction.mode === "update" && !current) throw new Error("Não encontrei esse serviço cadastrado.");
        const name = configAction.name || current?.name || "";
        const priceCents = configAction.priceCents || current?.priceCents || 0;
        const duration = configAction.durationMinutes || current?.durationMinutes || 0;
        if (!name || duration < 5) throw new Error("Faltam o nome ou a duração do serviço.");
        ok = await post({ action: "save-service", id: current?.id ?? 0, name, priceCents, durationMinutes: duration, active: current?.active ?? true }, current ? "Serviço atualizado pelo assistente." : "Serviço criado pelo assistente.");
      } else if (configAction.kind === "plan") {
        const current = configAction.mode === "update"
          ? data.plans.find((item) => sameName(configAction.target || configAction.name, item.name))
          : undefined;
        if (configAction.mode === "update" && !current) throw new Error("Não encontrei esse plano cadastrado.");
        const serviceName = configAction.serviceName
          ? data.services.find((item) => sameName(configAction.serviceName, item.name))?.name
          : current?.planKind;
        const name = configAction.name || current?.name || "";
        const monthlyValueCents = configAction.monthlyValueCents || current?.monthlyValueCents || 0;
        const maxUses = configAction.maxUses || current?.maxUses || 0;
        const payout = configAction.barberPayoutCents || current?.barberPayoutCents || 0;
        if (!name || !serviceName || !monthlyValueCents || !maxUses) throw new Error("Faltam dados do plano. Diga nome, serviço, valor e quantidade de usos.");
        ok = await post({ action: "save-plan", id: current?.id ?? 0, name, planKind: serviceName, monthlyValueCents, maxUses, barberPayoutCents: payout, active: current?.active ?? true }, current ? "Plano atualizado pelo assistente." : "Plano criado pelo assistente.");
      } else if (configAction.kind === "payment") {
        const current = configAction.mode === "update"
          ? data.paymentMethods.find((item) => sameName(configAction.target || configAction.name, item.name))
          : undefined;
        if (configAction.mode === "update" && !current) throw new Error("Não encontrei essa forma de pagamento.");
        const name = configAction.name || current?.name || "";
        if (!name) throw new Error("Informe a forma de pagamento.");
        ok = await post({ action: "save-payment", id: current?.id ?? 0, name, feeBps: configAction.feeBps }, current ? "Taxa atualizada pelo assistente." : "Forma de pagamento criada pelo assistente.");
      } else if (configAction.kind === "agenda") {
        const weeklyHours = mergeSchedule(data.agendaSettings.weeklyHours, configAction.scheduleChanges);
        const firstEnabled = weeklyHours.find((row) => row.enabled);
        if (!firstEnabled) throw new Error("A barbearia precisa ter pelo menos um dia de atendimento.");
        ok = await post({
          action: "save-agenda-settings",
          useServiceDuration: configAction.useServiceDuration === "" ? data.agendaSettings.useServiceDuration : configAction.useServiceDuration === "on",
          openingTime: firstEnabled.openingTime,
          closingTime: firstEnabled.closingTime,
          weeklyHours: JSON.stringify(weeklyHours),
        }, "Agenda atualizada pelo assistente.");
      } else if (configAction.kind === "team-hours") {
        const member = data.team.find((item) => sameName(configAction.target, item.name));
        if (!member) throw new Error("Não encontrei esse profissional na equipe.");
        const weeklyHours = mergeSchedule(member.weeklyHours, configAction.scheduleChanges);
        ok = await post({
          action: "save-team",
          id: member.id,
          name: member.name,
          role: member.role,
          loginEmail: member.loginEmail ?? "",
          accessRole: member.accessRole,
          commissionRateBps: member.commissionRateBps,
          active: member.active,
          weeklyHours: JSON.stringify(weeklyHours),
        }, `Horários de ${member.name} atualizados pelo assistente.`);
      }
      if (ok) {
        addMessage("assistant", "Pronto. A configuração foi salva no Cortou Anotou.");
        setConfigAction(null);
      } else {
        addMessage("assistant", "Não consegui salvar essa alteração. Nenhuma configuração foi confirmada por este pedido.");
      }
    } catch (error) {
      addMessage("assistant", error instanceof Error ? error.message : "Não consegui aplicar essa configuração.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  function cancelConfigAction() {
    setConfigAction(null);
    addMessage("assistant", "Alteração cancelada. Nada foi modificado.");
  }

  async function ask(question: string, options: { skipUserMessage?: boolean; contextMessages?: Message[] } = {}) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || busy || requestInFlight.current) return;
    const baseMessages = options.contextMessages ?? messages;
    if (!options.skipUserMessage) addMessage("user", cleanQuestion);
    updateInput("");
    const normalizedQuestion = normalize(cleanQuestion);

    if (configAction) {
      if (/^(confirmar|confirma|pode|pode salvar|salvar|sim|fechado)$/.test(normalizedQuestion)) {
        await confirmConfigAction();
      } else if (/^(cancelar|cancela|nao)$/.test(normalizedQuestion)) {
        cancelConfigAction();
      } else {
        addMessage("assistant", "Tenho uma alteração aguardando confirmação. Confirme para salvar ou cancele para fazer outro pedido.");
      }
      return;
    }

    if (actionDraft && normalizedQuestion === "cancelar") {
      setActionDraft(null);
      setActiveField(null);
      addMessage("assistant", "Ação cancelada. Nenhum dado foi salvo.");
      return;
    }
    if (actionDraft && !activeField && /^(confirmar|confirma|pode|pode salvar|salvar|sim|fechado)$/.test(normalizedQuestion)) {
      await confirmAction();
      return;
    }
    if (actionDraft && activeField) {
      applyAnswer(activeField, cleanQuestion);
      return;
    }
    if (actionDraft) {
      addMessage("assistant", "Use Confirmar e salvar para concluir ou Cancelar para descartar.");
      return;
    }

    const kind = requestedHelpAction(cleanQuestion);
    if (kind) {
      startAction(kind, cleanQuestion, false);
      return;
    }

    const requestMessages = options.skipUserMessage
      ? baseMessages
      : [...baseMessages, { id: nextMessageId.current, role: "user" as const, text: cleanQuestion }];
    requestInFlight.current = true;
    setAnswerPending(true);
    try {
      const response = await fetch("/api/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ messages: requestMessages.slice(-10).map((message) => ({ role: message.role, content: message.text })).filter((message) => message.content) }),
      });
      const result = await response.json() as Partial<HelpReply> & {error?:string};
      if (response.ok && result.action?.kind === "public-booking-link") {
        const slug = data.agendaSettings.publicBookingSlug;
        const url = slug ? `${window.location.origin}/agendar/${encodeURIComponent(slug)}` : "";
        addMessage("assistant", url ? "Aqui está seu link público de agendamento." : "O link público ainda não está disponível. Confira o Agendamento público nas Configurações.", {
          link: url ? { label: "Abrir link de agendamento", url } : undefined,
        });
      } else {
        addMessage("assistant", result.answer ?? result.error ?? "Não consegui responder agora. Tente novamente em instantes.", {
          destination: response.ok && result.destination && destinationAllowed(result.destination,viewer.isOwner) ? result.destination : undefined,
          suggestions: response.ok ? result.suggestions : undefined,
          retry: response.ok ? undefined : cleanQuestion,
        });
        if (response.ok && result.action) setConfigAction(result.action);
      }
    } catch {
      addMessage("assistant", "Não consegui responder agora. Verifique sua conexão e tente novamente.", {retry:cleanQuestion});
    } finally {
      requestInFlight.current = false;
      setAnswerPending(false);
    }
  }

  async function sendVoiceBlob(payload: HelpVoicePayload) {
    if (voiceUploading || requestInFlight.current) return;
    const url = URL.createObjectURL(payload.blob);
    audioUrlsRef.current.add(url);
    const id = nextMessageId.current++;
    const pendingMessage: Message = {
      id,
      role: "user",
      text: "",
      audio: {
        url,
        durationSeconds: payload.durationSeconds,
        transcript: "",
        showTranscript: false,
        status: "processing",
      },
    };
    setMessages((current) => [...current, pendingMessage]);
    setVoiceUploading(true);
    try {
      const extension = payload.mimeType.includes("mp4") || payload.mimeType.includes("m4a") ? "m4a"
        : payload.mimeType.includes("wav") ? "wav"
        : payload.mimeType.includes("mpeg") ? "mp3"
        : "webm";
      const form = new FormData();
      form.append("audio", payload.blob, `mensagem.${extension}`);
      const response = await fetch("/api/help/transcribe", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(35000),
      });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok || !result.text?.trim()) {
        setMessages((current) => current.map((message) => message.id === id && message.audio
          ? { ...message, audio: { ...message.audio, status: "error" as const } }
          : message));
        addMessage("assistant", result.error ?? "Não consegui entender esse áudio. Você pode tentar novamente.");
        return;
      }
      const transcript = result.text.trim();
      const readyMessage: Message = {
        ...pendingMessage,
        text: transcript,
        audio: { ...pendingMessage.audio!, transcript, status: "ready", showTranscript: false },
      };
      setMessages((current) => current.map((message) => message.id === id ? readyMessage : message));
      await ask(transcript, { skipUserMessage: true, contextMessages: [...messages, readyMessage] });
    } catch {
      setMessages((current) => current.map((message) => message.id === id && message.audio
        ? { ...message, audio: { ...message.audio, status: "error" as const } }
        : message));
      addMessage("assistant", "Não consegui processar esse áudio agora. Tente novamente.");
    } finally {
      setVoiceUploading(false);
    }
  }

  function toggleVoiceTranscript(id: number) {
    setMessages((current) => current.map((message) => message.id === id && message.audio
      ? { ...message, audio: { ...message.audio, showTranscript: !message.audio.showTranscript } }
      : message));
  }

  function summaryRows(draft: ActionDraft) {
    const barber = data.team.find((item) => item.id === draft.barberId)?.name ?? "";
    const service = data.services.find((item) => item.id === draft.serviceId)?.name ?? "";
    if (draft.kind === "record") {
      const client = draft.recordType === "Mensalista" ? data.clients.find((item) => item.id === draft.membershipClientId)?.name : draft.clientName;
      const payment = draft.recordType === "Mensalista" ? "Assinatura" : data.paymentMethods.find((item) => item.id === draft.paymentMethodId)?.name;
      return [["Ação", "Novo atendimento"], ["Tipo", draft.recordType ?? ""], ["Cliente", client ?? ""], ["Serviço", draft.recordType === "Mensalista" ? "Conforme o plano" : service], ["Pagamento", payment ?? ""], ["Barbeiro", barber], ["Data", displayDate(draft.occurredAt)]];
    }
    if (draft.kind === "appointment") return [["Ação", "Novo agendamento"], ["Cliente", draft.clientName ?? ""], ["Data", displayDate(draft.appointmentDate)], ["Horário", draft.appointmentTime ?? ""], ["Serviço", service], ["Barbeiro", barber]];
    return [["Ação", "Nova despesa"], ["Descrição", draft.description ?? ""], ["Valor", money(draft.valueCents)], ["Tipo", draft.expenseType ?? ""], ["Situação", draft.paid ? "Pago" : "Pendente"], ["Data", displayDate(draft.occurredAt)]];
  }

  async function confirmAction() {
    if (!actionDraft || nextField(actionDraft) || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    try {
    let ok = false;
    if (actionDraft.kind === "record") {
      ok = await post({ action: "daily-record", occurredAt: actionDraft.occurredAt ?? isoDate(), recordType: actionDraft.recordType ?? "Avulso", clientName: actionDraft.clientName ?? "", membershipClientId: actionDraft.membershipClientId ?? 0, barberId: actionDraft.barberId ?? viewer.teamMemberId, serviceId: actionDraft.serviceId ?? 0, paymentMethodId: actionDraft.paymentMethodId ?? data.paymentMethods[0]?.id ?? 0, origin: actionDraft.recordType === "Mensalista" ? "Assinatura" : "Retorno", tipCents: 0 }, "Atendimento salvo e painel atualizado.");
    } else if (actionDraft.kind === "appointment") {
      ok = await post({ action: "appointment", appointmentDate: actionDraft.appointmentDate ?? "", appointmentTime: actionDraft.appointmentTime ?? "", clientName: actionDraft.clientName ?? "", phone: actionDraft.phone ?? "", serviceId: actionDraft.serviceId ?? 0, barberId: actionDraft.barberId ?? viewer.teamMemberId, notes: "Criado pelo Assistente Cortou Anotou" }, "Horário agendado.");
    } else {
      ok = await post({ action: "expense", occurredAt: actionDraft.occurredAt ?? isoDate(), type: actionDraft.expenseType ?? "Variável", description: actionDraft.description ?? "", valueCents: actionDraft.valueCents ?? 0, paid: actionDraft.paid ?? true }, "Despesa registrada.");
    }
    if (ok) {
      addMessage("assistant", actionDraft.kind === "record" ? "Atendimento salvo! O painel e o histórico já estão atualizados." : actionDraft.kind === "appointment" ? "Horário agendado! Ele já aparece na agenda." : "Despesa salva! O financeiro já foi recalculado.");
      setActionDraft(null);
      setActiveField(null);
    } else addMessage("assistant", "Não consegui salvar. Confira o aviso do Cortou Anotou; nenhum dado foi gravado por este pedido.");
    } catch {
      addMessage("assistant", "Não consegui confirmar se o pedido foi salvo. Confira o Histórico ou a tela correspondente antes de tentar novamente.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  function cancelAction() {
    setActionDraft(null);
    setActiveField(null);
    addMessage("assistant", "Ação cancelada. Nenhum dado foi salvo.");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draftTextRef.current);
  }

  const choices = choicesFor(activeField);
  function navigate(destination:HelpDestination) {
    if (!destinationAllowed(destination,viewer.isOwner)) return;
    closeVoice(); setOpen(false); onNavigate(destination);
  }

  return <>
    <button ref={launcherRef} className={"help-launcher"+(open ? " is-open" : "")} type="button" aria-label="Abrir Assistente Cortou Anotou" aria-expanded={open} aria-controls="cortou-anotou-help" onClick={openPanel}><span><AppIcon name="help" /></span><strong>Ajuda</strong></button>
    {rendered && <>
      <div className={"help-chat-backdrop" + (open ? "" : " is-closing")} onClick={closeHelp} aria-hidden="true" />
      <section ref={panelRef} className={"help-panel help-chat" + (open ? "" : " is-closing")} id="cortou-anotou-help" role="dialog" aria-modal="true" aria-labelledby="help-title" inert={!open}>
        <header className="help-header"><span className="help-header-mark"><AppIcon name="help" /></span><div><h2 id="help-title">Assistente Cortou Anotou</h2><small>Pergunte, consulte ou peça para fazer</small></div><button ref={closeRef} type="button" aria-label="Fechar Assistente Cortou Anotou" onClick={closeHelp}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
        <div className="help-chat-scroll" ref={scrollRef}>
          <div className="help-messages" role="log" aria-live="polite" aria-relevant="additions">
            {messages.map(message=><div className={"help-message "+message.role+(message.audio ? " voice" : "")} key={message.id}>
              {message.audio
                ? <HelpVoiceBubble
                    url={message.audio.url}
                    durationSeconds={message.audio.durationSeconds}
                    transcript={message.audio.transcript}
                    showTranscript={message.audio.showTranscript}
                    status={message.audio.status}
                    onToggleTranscript={()=>toggleVoiceTranscript(message.id)}
                  />
                : <p>{message.text}</p>}
              {message.destination && <button type="button" className="help-destination" disabled={busy} onClick={()=>navigate(message.destination!)}>{message.destination.label}<span aria-hidden="true">→</span></button>}
              {message.suggestions && <div className="help-inline-suggestions">{message.suggestions.map(text=><button type="button" key={text} disabled={busy} onClick={()=>void ask(text)}>{text}</button>)}</div>}
              {message.link && <a className="help-destination help-link" href={message.link.url} target="_blank" rel="noreferrer">{message.link.label}<span aria-hidden="true">↗</span></a>}{message.retry && <button className="help-destination" type="button" disabled={busy} onClick={()=>void ask(message.retry!)}>Tentar novamente</button>}
            </div>)}
            {answerPending && <div className="help-message assistant typing" aria-label="Consultando, aguarde"><i /><i /><i /></div>}
          </div>
          {messages.length === 1 && <div className="help-starter-prompts">{helpSuggestions.map(text=><button type="button" key={text} onClick={()=>void ask(text)}>{text}<span aria-hidden="true">↗</span></button>)}</div>}
          {choices.length > 0 && <div className="help-choices">{choices.map(choice=><button type="button" disabled={busy} key={choice.label} onClick={()=>{ voice.discard(); updateInput(""); addMessage("user",choice.label); applyAnswer(activeField as ActionField,choice.value); }}>{choice.label}</button>)}</div>}
          {actionDraft && !activeField && <div className="help-confirm"><strong>Confira antes de salvar</strong><dl>{summaryRows(actionDraft).filter(row=>row[1]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div><button type="button" className="help-confirm-button" disabled={saving} onClick={()=>void confirmAction()}>{saving?"Salvando...":"Confirmar e salvar"}</button><button type="button" className="help-cancel-button" disabled={saving} onClick={cancelAction}>Cancelar</button></div></div>}{configAction && <div className="help-confirm help-config-confirm"><strong>O assistente entendeu assim</strong><dl>{configSummaryRows(configAction).filter(row=>row[1]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div><button type="button" className="help-confirm-button" disabled={saving} onClick={()=>void confirmConfigAction()}>{saving?"Salvando...":"Confirmar e salvar"}</button><button type="button" className="help-cancel-button" disabled={saving} onClick={cancelConfigAction}>Cancelar</button></div><small className="help-confirm-note">Nada é alterado antes da sua confirmação.</small></div>}
          {actionDraft && activeField && <button type="button" className="help-abandon" onClick={cancelAction}>Cancelar este pedido</button>}
        </div>
        <div className="help-composer">
          {voice.recording ? <div className="help-voice-recorder" role="group" aria-label="Gravando mensagem de áudio">
            <div className="help-voice-recorder-top">
              <span className={"help-voice-live"+(voice.paused ? " is-paused" : "")} aria-hidden="true" />
              <time>{formatHelpVoiceTime(voice.seconds)}</time>
              <HelpVoiceWave active={!voice.paused} />
            </div>
            <div className="help-voice-recorder-actions">
              <button type="button" className="voice-discard" aria-label="Apagar gravação" onClick={voice.discard}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
              </button>
              <button type="button" className={"voice-pause"+(voice.paused ? " paused" : "")} aria-label={voice.paused ? "Continuar gravação" : "Pausar gravação"} onClick={voice.togglePause}>
                {voice.paused
                  ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z"/></svg>
                  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>}
              </button>
              <button type="button" className="voice-send" aria-label="Enviar áudio" onClick={voice.send}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-5-7-2Z"/></svg>
              </button>
            </div>
            <small aria-live="polite">{voice.paused ? "Gravação pausada" : "Gravando áudio"}</small>
          </div> : <form className="help-form" onSubmit={submit}>
            <textarea ref={inputRef} value={input} onChange={event=>updateInput(event.target.value)} maxLength={HELP_MESSAGE_LIMIT} rows={1} placeholder={activeField?"Sua resposta...":"Escreva sua dúvida..."} aria-label="Mensagem para o Assistente Cortou Anotou" />
            <div className="help-composer-actions">
              {input.trim()
                ? <button className="help-send" disabled={busy} aria-label="Enviar mensagem">Enviar <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>
                : <button className="help-mic" type="button" disabled={busy || voice.requesting} aria-label="Gravar áudio" onClick={()=>void voice.start()}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/></svg>
                  </button>}
            </div>
          </form>}
          {(voice.requesting || voice.ready || voiceUploading) && !voice.recording && <small className="help-voice-status" aria-live="polite">{voice.requesting ? "Ativando microfone…" : voiceUploading ? "Entendendo o áudio…" : "Microfone pronto"}</small>}
          <a className="help-human-support" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer"><AppIcon name="whatsapp" /><span>Falar com o suporte</span></a>
        </div>
      </section>
    </>}
  </>;
}
