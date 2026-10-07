import { and, eq, isNull } from "drizzle-orm";
import { appDate } from "../lib/app-date";
import { validClientName } from "../lib/client-name";
import {
  classifyCaAtendeByRule,
  extractCaAtendeDate,
  extractCaAtendeTime,
  extractCaAtendeTimeWindow,
  formatCaAtendeMoney,
  highConfidenceCommercialOffer,
  mergeCaAtendeMemory,
  normalizeCaAtendeText,
  type CaAtendeContextMemory,
  type CaAtendeInterpretation,
} from "../lib/ca-atende";
import { interpretCaAtendeWithAi } from "../lib/ca-atende-model";
import { cancelWhatsappManagedBooking, createPublicBooking, getPublicBookingData, getPublicBookingSlotsExpanded, listWhatsappManagedBookings, rescheduleWhatsappManagedBooking, type WhatsappManagedBooking } from "./public-booking";
import { recordAiUsageSafely } from "./ai-usage";
import { getDb } from "./index";
import { getWhatsappEntitlementForOrganization } from "./whatsapp-entitlement";
import { notifyOwnersOfWhatsappHandoff } from "./notifications";
import {
  organizations,
  services,
  team,
  whatsappAutomationSettings,
  whatsappConnections,
  whatsappConversations,
} from "./schema";
import { processWhatsappQueueSafely, queueWhatsappTextReply, type WhatsappInboundTextEvent } from "./whatsapp";

type CaAtendeRuntimeContext = {
  organization: { id: number; name: string; slug: string };
  services: Array<{ id: number; name: string; priceCents: number; durationMinutes: number }>;
  barbers: Array<{ id: number; name: string }>;
  settings: {
    enabled: boolean;
    botEnabled: boolean;
    cancellationEnabled: boolean;
    rescheduleEnabled: boolean;
    economyMode: boolean;
    bookingLinkFirst: boolean;
    spamFilterEnabled: boolean;
    aiFallbackEnabled: boolean;
    greetingText: string;
    handoffText: string;
  };
  connected: boolean;
};

function appBaseUrl() {
  // Customer-facing invitations always use the verified public domain.
  return "https://cortouanotou.com.br";
}

function bookingLink(slug: string) {
  return `${appBaseUrl()}/agendar/${encodeURIComponent(slug)}`;
}

function safeChoices(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || "").trim().slice(0, 180)).filter(Boolean).slice(0, 10);
}

function safeMemory(value: string): CaAtendeContextMemory {
  try {
    const parsed = JSON.parse(value || "{}") as CaAtendeContextMemory;
    return {
      intent: String(parsed.intent || "").slice(0,40),
      date: String(parsed.date || "").slice(0,10),
      time: String(parsed.time || "").slice(0,5),
      service: String(parsed.service || "").slice(0,120),
      barber: String(parsed.barber || "").slice(0,120),
      clientName: String(parsed.clientName || "").slice(0,120),
      paymentChoice: String(parsed.paymentChoice || "").slice(0,30),
      appointmentId: Math.max(0, Math.round(Number(parsed.appointmentId || 0))),
      manageAction: parsed.manageAction === "cancel" || parsed.manageAction === "reschedule" ? parsed.manageAction : "",
      lastChoices: safeChoices(parsed.lastChoices),
      afterTime: String(parsed.afterTime || "").slice(0,5),
      beforeTime: String(parsed.beforeTime || "").slice(0,5),
    };
  } catch {
    return {};
  }
}

function findNamedItem<T extends { name: string }>(message: string, requested: string, items: T[]) {
  const normalizedMessage = normalizeCaAtendeText(message);
  const direct = items
    .slice()
    .sort((a,b) => b.name.length - a.name.length)
    .find(item => {
      const name = normalizeCaAtendeText(item.name);
      return name.length >= 2 && (normalizedMessage === name || normalizedMessage.includes(name));
    });
  if (direct) return direct;

  const requestedNormalized = normalizeCaAtendeText(requested);
  if (requestedNormalized && normalizedMessage === requestedNormalized) {
    return items.find(item => normalizeCaAtendeText(item.name) === requestedNormalized) ?? null;
  }
  return null;
}

function singleService(items: CaAtendeRuntimeContext["services"], wanted: "cut" | "beard") {
  return items.find((item) => {
    const name = normalizeCaAtendeText(item.name);
    if (wanted === "cut") return /\b(corte|cabelo)\b/.test(name) && !/\bbarba\b/.test(name);
    return /\bbarba\b/.test(name) && !/\b(corte|cabelo)\b/.test(name);
  }) ?? null;
}

function serviceIntentSignals(message: string) {
  const text = normalizeCaAtendeText(message);
  const mentionsCut = /\b(cortar|corte|cabelo|cabeca)\b/.test(text);
  const mentionsBeard = /\b(barba|barbear|barbinha)\b/.test(text);
  const rejectBeard = /\bsem\s+(?:a\s+)?barba\b/.test(text)
    || /\bnao\s+(?:quero|preciso|vou querer|faz|fazer)\s+(?:a\s+)?barba\b/.test(text)
    || /\bbarba\s+nao(?:\s+(?:quero|preciso))?\b/.test(text)
    || /\b(?:so|somente|apenas)\s+(?:o\s+)?(?:corte|cabelo)\b/.test(text);
  const rejectCut = /\bsem\s+(?:o\s+)?(?:corte|cabelo)\b/.test(text)
    || /\bnao\s+(?:quero|preciso|vou querer|faz|fazer)\s+(?:o\s+)?(?:corte|cabelo)\b/.test(text)
    || /\b(?:corte|cabelo)\s+nao(?:\s+(?:quero|preciso))?\b/.test(text)
    || /\b(?:so|somente|apenas)\s+(?:a\s+)?barba\b/.test(text);
  return { text, mentionsCut, mentionsBeard, rejectBeard, rejectCut };
}

function findServiceByMessage(message: string, items: CaAtendeRuntimeContext["services"]) {
  const { text, mentionsCut, mentionsBeard, rejectBeard, rejectCut } = serviceIntentSignals(message);
  if (mentionsCut && rejectBeard && !rejectCut) return singleService(items, "cut");
  if (mentionsBeard && rejectCut && !rejectBeard) return singleService(items, "beard");
  if (mentionsCut && mentionsBeard && !rejectBeard && !rejectCut) {
    const combined = items.find(item => /\b(corte|cabelo)\b/.test(normalizeCaAtendeText(item.name)) && /\bbarba\b/.test(normalizeCaAtendeText(item.name)));
    if (combined) return combined;
    // Do not silently replace a requested combination with only one service.
    return null;
  }
  const direct = findNamedItem(message, "", items);
  if (direct) return direct;
  const aliases: Array<[RegExp, RegExp]> = [
    [/\b(cortar|corte|cabelo|cabeca)\b/, /\bcorte\b/],
    [/\b(barba|barbear|barbinha)\b/, /\bbarba\b/],
    [/\b(sobrancelha|sobrancelhas)\b/, /\bsobrancelha\b/],
    [/\b(pezinho|pe zinho|acabamento)\b/, /\bpezinho\b/],
    [/\b(luzes|luz)\b/, /\bluzes\b/],
    [/\b(pigmentar|pigmentacao|pigmentado)\b/, /\bpigment/],
  ];
  for (const [messagePattern, servicePattern] of aliases) {
    if (!messagePattern.test(text)) continue;
    const found = items.find(item => servicePattern.test(normalizeCaAtendeText(item.name)));
    if (found) return found;
  }
  return null;
}

function defaultGreeting(context: CaAtendeRuntimeContext) {
  const link = bookingLink(context.organization.slug);
  const custom = context.settings.greetingText.trim();
  if (custom) {
    const rendered = custom
      .replaceAll("{barbearia}", context.organization.name)
      .replaceAll("{link}", link)
      .trim();
    const withLink = rendered.includes(link)
      ? rendered
      : `${rendered}\nPara agendar: ${link}`;
    const invitation = /\b(se precisar|me diga|pode falar|como posso ajudar)\b/i.test(rendered)
      ? ""
      : "\nSe precisar de algo, é só me dizer.";
    return `${withLink}${invitation}`.slice(0,3500);
  }
  return `Olá! Seja bem-vindo à ${context.organization.name}.\nPara agendar: ${link}\nSe precisar de algo, é só me dizer.`;
}

function asksForPrice(value: string) {
  const text = normalizeCaAtendeText(value);
  if (/\b(lista de servicos|quais servicos)\b/.test(text)) return true;
  if (/\b(preco|precos|valor|valores|vlr|custa|custo|cobra|cobram|orcamento)\b/.test(text)) return true;
  if (/\b(quanto tempo|quantos minutos|quanto demora|quanto dura)\b/.test(text)) return false;
  return /\b(quanto|qto)\b/.test(text) || /\b(sai|fica)\s+(?:por|quanto)\b/.test(text);
}

function refersToPreviousService(value: string) {
  return /\b(esse|essa|isso|mesmo|mesma|dele|dela|disso|daquele|daquela)\b/.test(normalizeCaAtendeText(value));
}

function asksForDuration(value: string) {
  return /\b(quanto tempo|quantos minutos|duracao|dura|demora)\b/.test(normalizeCaAtendeText(value));
}

function defaultHandoff(context: CaAtendeRuntimeContext) {
  const custom = context.settings.handoffText.trim();
  if (custom) return custom.replaceAll("{barbearia}", context.organization.name).slice(0,3500);
  return `Beleza. Vou deixar sua mensagem para o responsável da ${context.organization.name}. Assim que ele estiver disponível, responde por aqui.`;
}

function compactServiceNames(context: CaAtendeRuntimeContext) {
  const names = context.services.slice(0,6).map(item => item.name);
  const suffix = context.services.length > 6 ? " e outros" : "";
  return names.length ? `${names.join(", ")}${suffix}` : "os serviços da barbearia";
}

async function runtimeContext(organizationId: number): Promise<CaAtendeRuntimeContext | null> {
  const db = await getDb();
  const [organization, setting, connection, serviceList, barberList] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db.select().from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, organizationId)).limit(1),
    db.select({ status: whatsappConnections.status }).from(whatsappConnections).where(eq(whatsappConnections.organizationId, organizationId)).limit(1),
    db.select({ id: services.id, name: services.name, priceCents: services.priceCents, durationMinutes: services.durationMinutes })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.active, true), isNull(services.deletedAt)))
      .orderBy(services.name),
    db.select({ id: team.id, name: team.name }).from(team)
      .where(and(eq(team.organizationId, organizationId), eq(team.active, true)))
      .orderBy(team.name),
  ]);
  if (!organization[0]) return null;
  const current = setting[0];
  return {
    organization: organization[0],
    services: serviceList,
    barbers: barberList,
    connected: connection[0]?.status === "connected",
    settings: {
      enabled: Boolean(current?.enabled),
      botEnabled: Boolean(current?.botEnabled),
      cancellationEnabled: current?.cancellationEnabled === undefined ? true : Boolean(current.cancellationEnabled),
      rescheduleEnabled: current?.rescheduleEnabled === undefined ? true : Boolean(current.rescheduleEnabled),
      economyMode: current?.economyMode === undefined ? true : Boolean(current.economyMode),
      bookingLinkFirst: current?.bookingLinkFirst === undefined ? true : Boolean(current.bookingLinkFirst),
      spamFilterEnabled: current?.spamFilterEnabled === undefined ? true : Boolean(current.spamFilterEnabled),
      aiFallbackEnabled: current?.aiFallbackEnabled === undefined ? true : Boolean(current.aiFallbackEnabled),
      greetingText: String(current?.greetingText ?? ""),
      handoffText: String(current?.handoffText ?? ""),
    },
  };
}

async function conversationState(organizationId: number, phone: string) {
  const db = await getDb();
  return (await db.select().from(whatsappConversations).where(and(
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.phone, phone),
  )).limit(1))[0] ?? null;
}

function isPaused(conversation: Awaited<ReturnType<typeof conversationState>>) {
  if (!conversation) return false;
  if (conversation.pauseReason === "human_takeover" && !conversation.automationPausedUntil) return true;
  return Boolean(conversation.automationPausedUntil && conversation.automationPausedUntil > new Date().toISOString());
}

async function updateConversation(input: {
  organizationId: number;
  phone: string;
  intent: string;
  state?: string;
  memory?: CaAtendeContextMemory;
  replyAt?: string | null;
  suspectedOfferAt?: string | null;
  humanRequestedAt?: string | null;
  indefiniteHandoff?: boolean;
  unresolvedTurns?: number;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const values = {
    organizationId: input.organizationId,
    phone: input.phone,
    botState: input.state ?? "",
    botContextJson: JSON.stringify(input.memory ?? {}),
    lastIntent: input.intent.slice(0,40),
    lastBotReplyAt: input.replyAt ?? null,
    suspectedOfferAt: input.suspectedOfferAt ?? null,
    humanRequestedAt: input.humanRequestedAt ?? null,
    unresolvedTurns: Math.max(0, Math.min(20, Math.round(Number(input.unresolvedTurns ?? 0)))),
    automationPausedUntil: input.indefiniteHandoff ? null : undefined,
    pauseReason: input.indefiniteHandoff ? "human_takeover" : undefined,
    updatedAt: now,
  };
  await db.insert(whatsappConversations).values({
    organizationId: values.organizationId,
    phone: values.phone,
    botState: values.botState,
    botContextJson: values.botContextJson,
    lastIntent: values.lastIntent,
    lastBotReplyAt: values.lastBotReplyAt,
    suspectedOfferAt: values.suspectedOfferAt,
    humanRequestedAt: values.humanRequestedAt,
    unresolvedTurns: values.unresolvedTurns,
    automationPausedUntil: input.indefiniteHandoff ? null : null,
    pauseReason: input.indefiniteHandoff ? "human_takeover" : "",
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [whatsappConversations.organizationId, whatsappConversations.phone],
    set: {
      botState: values.botState,
      botContextJson: values.botContextJson,
      lastIntent: values.lastIntent,
      ...(input.replyAt !== undefined ? { lastBotReplyAt: values.lastBotReplyAt } : {}),
      ...(input.suspectedOfferAt !== undefined ? { suspectedOfferAt: values.suspectedOfferAt } : {}),
      ...(input.humanRequestedAt !== undefined ? { humanRequestedAt: values.humanRequestedAt } : {}),
      ...(input.unresolvedTurns !== undefined ? { unresolvedTurns: values.unresolvedTurns } : {}),
      ...(input.indefiniteHandoff ? { automationPausedUntil: null, pauseReason: "human_takeover" } : {}),
      updatedAt: now,
    },
  });
}

async function interpretationFor(message: string, context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory, state = "") {
  const rule = classifyCaAtendeByRule(message);
  if (context.settings.spamFilterEnabled && highConfidenceCommercialOffer(message)) return { ...rule, intent:"spam" as const };

  const normalized = normalizeCaAtendeText(message);
  if (normalized === "qualquer profissional") return { ...rule, intent:memory.intent === "availability" ? "availability" as const : "booking" as const };
  if (normalized === "precos e servicos") return { ...rule, intent:"prices" as const };

  const date = extractCaAtendeDate(message);
  const time = extractCaAtendeTime(message);
  const timeWindow = extractCaAtendeTimeWindow(message);
  const words = normalized.split(" ").filter(Boolean);
  const shortEntityChoice = words.length <= 4 && [...context.services.map(item => item.name), ...context.barbers.map(item => item.name)].some((name) => {
    const entityWords = normalizeCaAtendeText(name).split(" ").filter(Boolean);
    return entityWords.length > 0 && entityWords.every((word) => words.includes(word));
  });
  const exactEntityChoice = [...context.services.map(item => item.name), ...context.barbers.map(item => item.name)]
    .some(name => normalized === normalizeCaAtendeText(name) || normalized === `quero o ${normalizeCaAtendeText(name)}`);
  const knownService = context.services.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const knownBarber = context.barbers.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const bookingContinuation = (memory.intent === "booking" || memory.intent === "availability")
    && (knownService || knownBarber || shortEntityChoice || Boolean(date) || Boolean(time) || Boolean(timeWindow.afterTime) || Boolean(timeWindow.beforeTime) || wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message));
  const simpleDateChoice = Boolean(date) && words.length <= 3;
  const simpleTimeChoice = Boolean(time) && words.length <= 3;
  const simpleWindowChoice = (Boolean(timeWindow.afterTime) || Boolean(timeWindow.beforeTime)) && words.length <= 6;
  const guidedConversationCommand = wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message);
  const deterministicContinuation = bookingContinuation
    && (exactEntityChoice || shortEntityChoice || simpleDateChoice || simpleTimeChoice || simpleWindowChoice || guidedConversationCommand);

  // Escritas e mudanças sensíveis continuam determinísticas. Cumprimentos,
  // preços e respostas curtas dos botões também não precisam gastar uma chamada
  // de modelo. A IA vira o intérprete principal da conversa livre.
  if (rule.intent === "spam" || rule.intent === "human" || rule.intent === "cancel" || rule.intent === "reschedule" || rule.intent === "greeting" || rule.intent === "prices") return rule;
  if (deterministicContinuation) return { ...rule, intent:memory.intent as "booking" | "availability" };
  if (exactEntityChoice || shortEntityChoice) {
    return { ...rule, intent:memory.intent === "prices" ? "prices" as const : "booking" as const };
  }

  let interpretation: CaAtendeInterpretation = rule;
  const shouldUseAi = context.settings.aiFallbackEnabled
    && (rule.intent === "booking" || rule.intent === "availability" || rule.intent === "unknown");
  if (shouldUseAi) {
    const ai = await interpretCaAtendeWithAi({
      message,
      organizationName: context.organization.name,
      services: context.services.map(item => item.name),
      barbers: context.barbers.map(item => item.name),
      memory,
      state,
    });
    if (ai) {
      await recordAiUsageSafely({ organizationId:context.organization.id, surface:"ca_atende", usage:ai.aiUsage });
      // A model classification alone is not enough to silence a real client.
      // Only the high-confidence rule can mark a commercial offer as spam.
      // A guessed price intent cannot turn an unrelated voice transcription
      // into an unsolicited price from the previous conversation.
      interpretation = ai.intent === "spam" || (ai.intent === "prices" && !asksForPrice(message)) ? rule : ai;
      if (interpretation.intent !== "unknown") return interpretation;
    }
  }

  if (rule.intent !== "unknown") return rule;
  if (bookingContinuation) return { ...rule, intent:memory.intent as "booking" | "availability" };
  return interpretation;
}

type CaAtendeConversationSnapshot = {
  botState?: string | null;
  botContextJson?: string | null;
  unresolvedTurns?: number | null;
};

type CaAtendeDecision = {
  reply: string;
  intent: string;
  state: string;
  memory: CaAtendeContextMemory;
  source: "rule" | "ai";
  dataSource?: "agenda" | "services";
  handoff?: boolean;
  spam?: boolean;
  confirmationRequested?: boolean;
  choices?: string[];
  bookingRequest?: { date:string; time:string; serviceId:number; barberId:number; clientName:string; paymentChoice:string };
  managementRequest?: { action:"cancel" | "reschedule"; appointmentId:number; date?:string; time?:string };
};

function guardedDecision(
  decision: CaAtendeDecision,
  conversation: CaAtendeConversationSnapshot | null,
  context: CaAtendeRuntimeContext,
) {
  if (decision.handoff || decision.spam) return { decision, unresolvedTurns:0 };
  const previousMemory = safeMemory(conversation?.botContextJson ?? "{}");
  const previousState = String(conversation?.botState ?? "");
  const waitingState = decision.state === "booking_method"
    || decision.state === "cancel_choice"
    || decision.state.startsWith("awaiting_")
    || decision.intent === "unknown";
  const noProgress = waitingState
    && decision.state === previousState
    && JSON.stringify(decision.memory) === JSON.stringify(previousMemory);
  const unresolvedTurns = noProgress ? Math.min(20, Number(conversation?.unresolvedTurns ?? 0) + 1) : 0;
  if (unresolvedTurns < 3) return { decision, unresolvedTurns };
  return {
    unresolvedTurns,
    decision: {
      reply:`Não consegui resolver isso com segurança por aqui. Vou chamar alguém da ${context.organization.name} para continuar com você.`,
      intent:"human",
      state:"human_takeover",
      memory:decision.memory,
      source:decision.source,
      handoff:true,
    } satisfies CaAtendeDecision,
  };
}

function explicitHumanRequest(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(falar|conversar|chamar|atendente|humano|responsavel|proprietario|dono)\b/.test(text);
}

function wantsAssistedBooking(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(resolver por aqui|por aqui mesmo|quero fazer por aqui|quero ajuda por aqui|nao quero o link|nao quero clicar|sem link)\b/.test(text);
}

function wantsAnotherProfessional(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(outro profissional|outra pessoa|outro barbeiro|outra barbeira|tem outro|com outro|trocar profissional|troca profissional|mudar profissional|trocar barbeiro)\b/.test(text);
}

function wantsBookingConfirmation(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(confirma|confirmar|confirma pra mim|pode marcar|marca pra mim|marque pra mim|quero que (voce|vc) marque|pode agendar|agende pra mim|pode fechar|fecha pra mim)\b/.test(text);
}

const mainChoices = ["Agendar horário", "Ver horários disponíveis", "Preços e serviços", "Cancelar ou remarcar", "Falar com a barbearia"];
const choiceNumberEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

function rememberedChoice(value: string, choices: string[] | undefined) {
  const safe = safeChoices(choices);
  if (!safe.length) return "";
  const text = normalizeCaAtendeText(value);
  const match = /^(?:opcao\s*)?(\d{1,2})$/.exec(text);
  if (!match) return "";
  const index = Number(match[1]) - 1;
  return index >= 0 && index < safe.length ? safe[index] : "";
}

function formatChoiceLine(choice: string, index: number) {
  const number = choiceNumberEmoji[index] ?? `${index + 1}.`;
  return `${number} ${choice}`;
}

function bookingDayChoices(count = 5) {
  const today = appDate();
  const base = new Date(`${today}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday:"long", timeZone:"America/Sao_Paulo" });
  return Array.from({ length:count }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() + index);
    const name = weekday.format(day).replace("-feira", "");
    const prettyName = name.charAt(0).toUpperCase() + name.slice(1);
    const dd = String(day.getUTCDate()).padStart(2, "0");
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
    if (index === 0) return `Hoje · ${prettyName}`;
    if (index === 1) return `Amanhã · ${prettyName}`;
    return `${prettyName} · ${dd}/${mm}`;
  });
}

function representativeSlots<T extends { time:string; barberId:number; barberName:string }>(slots: T[], max = 9) {
  const seen = new Set<string>();
  const unique = slots.filter((slot) => {
    const key = `${slot.barberId}:${slot.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const buckets = [
    unique.filter((slot) => slot.time < "12:00"),
    unique.filter((slot) => slot.time >= "12:00" && slot.time < "18:00"),
    unique.filter((slot) => slot.time >= "18:00"),
  ];
  const picked: T[] = [];
  while (picked.length < max && buckets.some((bucket) => bucket.length)) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) picked.push(next);
      if (picked.length >= max) break;
    }
  }
  return picked.sort((left, right) => left.time.localeCompare(right.time) || left.barberName.localeCompare(right.barberName, "pt-BR"));
}

function safeClientName(value: string | undefined) {
  if (!value) return "";
  try {
    return validClientName(value, 120);
  } catch {
    return "";
  }
}

async function bookingPaymentChoices(context: CaAtendeRuntimeContext) {
  const data = await getPublicBookingData(context.organization.slug);
  if (!data) return [] as string[];
  return [
    data.payments.pixEnabled && "Pix",
    data.payments.cashEnabled && "Dinheiro",
    data.payments.debitEnabled && "Débito",
    data.payments.creditEnabled && "Crédito",
  ].filter(Boolean) as string[];
}

function paymentChoiceFromText(value: string, available: string[]) {
  const text = normalizeCaAtendeText(value);
  const exact = available.find(item => normalizeCaAtendeText(item) === text);
  if (exact) return exact;
  if (/\bpix\b/.test(text) && available.includes("Pix")) return "Pix";
  if (/\b(dinheiro|especie)\b/.test(text) && available.includes("Dinheiro")) return "Dinheiro";
  if (/\bdebito\b/.test(text) && available.includes("Débito")) return "Débito";
  if (/\bcredito\b/.test(text) && available.includes("Crédito")) return "Crédito";
  if (/\bcartao\b/.test(text)) {
    const cardChoices = available.filter(item => item === "Débito" || item === "Crédito");
    if (cardChoices.length === 1) return cardChoices[0];
  }
  return "";
}

function bookingRequestFromMemory(context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory) {
  const service = memory.service ? findNamedItem(memory.service, memory.service, context.services) : null;
  const barber = memory.barber ? findNamedItem(memory.barber, memory.barber, context.barbers) : null;
  const clientName = safeClientName(memory.clientName);
  const paymentChoice = String(memory.paymentChoice || "");
  if (!service || !barber || !memory.date || !memory.time || !clientName || !paymentChoice) return null;
  return {
    date:memory.date,
    time:memory.time,
    serviceId:service.id,
    barberId:barber.id,
    clientName,
    paymentChoice,
  };
}

function serviceChoices(context: CaAtendeRuntimeContext, offset = 0) {
  const items = context.services.slice(offset, offset + 5).map(item => item.name);
  if (context.services.length > offset + 5) items.push("Ver outros serviços");
  return items;
}

function professionalChoices(context: CaAtendeRuntimeContext, current = "") {
  return [...context.barbers.filter(item => item.name !== current).slice(0,8).map(item => item.name), "Qualquer profissional"];
}

function menuDecision(context: CaAtendeRuntimeContext): CaAtendeDecision {
  return { reply:`Como posso ajudar na ${context.organization.name}? Escolha uma opção ou escreva do seu jeito.`, intent:"menu", state:"menu", memory:{}, source:"rule", choices:mainChoices };
}

function wantsAfterTime(value: string) {
  return Boolean(extractCaAtendeTimeWindow(value).afterTime);
}

function humanDate(value: string) {
  if (value === appDate()) return "hoje";
  return value.split("-").reverse().join("/");
}

function managedBookingLabel(item: WhatsappManagedBooking, index?: number) {
  const prefix = index === undefined ? "" : `${index + 1}. `;
  return `${prefix}${humanDate(item.date)} às ${item.time} · ${item.serviceName} · ${item.barberName}`;
}

function managedBookingChoices(items: WhatsappManagedBooking[]) {
  return items.slice(0,5).map((item) => managedBookingLabel(item));
}

function chooseManagedBooking(message: string, items: WhatsappManagedBooking[]) {
  const normalized = normalizeCaAtendeText(message);
  const index = /^(?:opcao\s*)?([1-5])$/.exec(normalized);
  if (index) return items[Number(index[1]) - 1] ?? null;
  const date = extractCaAtendeDate(message);
  const time = extractCaAtendeTime(message);
  let matches = items.filter((item) => (!date || item.date === date) && (!time || item.time === time));
  const serviceMatches = matches.filter((item) => normalized.includes(normalizeCaAtendeText(item.serviceName)));
  if (serviceMatches.length) matches = serviceMatches;
  const barberMatches = matches.filter((item) => normalized.includes(normalizeCaAtendeText(item.barberName)));
  if (barberMatches.length) matches = barberMatches;
  return matches.length === 1 ? matches[0] : null;
}

function managementPrompt(action: "cancel" | "reschedule", item: WhatsappManagedBooking): CaAtendeDecision {
  const memory: CaAtendeContextMemory = { intent:action, manageAction:action, appointmentId:item.appointmentId, date:item.date, time:item.time, service:item.serviceName, barber:item.barberName, clientName:item.clientName };
  if (action === "cancel") {
    return { reply:`Encontrei ${item.serviceName} com ${item.barberName}, ${humanDate(item.date)} às ${item.time}. Quer cancelar esse horário?`, intent:"cancel", state:"awaiting_cancel_confirmation", memory, source:"rule", choices:["Confirmar cancelamento", "Manter horário"], dataSource:"agenda" };
  }
  return { reply:`Encontrei ${item.serviceName} com ${item.barberName}, ${humanDate(item.date)} às ${item.time}. Para qual dia você quer remarcar?`, intent:"reschedule", state:"awaiting_reschedule_date", memory, source:"rule", choices:bookingDayChoices(), dataSource:"agenda" };
}

async function beginManagementFlow(action: "cancel" | "reschedule", event: WhatsappInboundTextEvent, context: CaAtendeRuntimeContext, source: "rule" | "ai"): Promise<CaAtendeDecision> {
  const enabled = action === "cancel" ? context.settings.cancellationEnabled : context.settings.rescheduleEnabled;
  if (!enabled) return { reply:`Essa automação está desligada agora. Vou chamar alguém da ${context.organization.name} para te ajudar.`, intent:action, state:"human_takeover", memory:{ intent:action }, source, handoff:true };
  const appointments = await listWhatsappManagedBookings(context.organization.slug, event.phone);
  if (!appointments.length) return { reply:"Não encontrei nenhum horário futuro ligado a este WhatsApp. Se quiser, posso chamar a barbearia.", intent:action, state:"", memory:{}, source:"rule", choices:["Falar com a barbearia", "Ver opções"], dataSource:"agenda" };
  const changeable = appointments.filter((item) => item.canChange);
  if (!changeable.length) return { reply:`Seu horário está a menos de 2 horas e não posso alterar automaticamente. Vou chamar alguém da ${context.organization.name}.`, intent:action, state:"human_takeover", memory:{ intent:action }, source:"rule", handoff:true, dataSource:"agenda" };
  if (changeable.length === 1) return managementPrompt(action, changeable[0]);
  return { reply:`Encontrei mais de um horário. Qual deles você quer ${action === "cancel" ? "cancelar" : "remarcar"}? Pode responder pelo número, dia ou horário.`, intent:action, state:"awaiting_manage_choice", memory:{ intent:action, manageAction:action, appointmentId:0 }, source:"rule", choices:managedBookingChoices(changeable), dataSource:"agenda" };
}

function slotSummary(slots: Array<{ time: string; barberId: number; barberName: string }>, max = 6) {
  const groups = new Map<string, string[]>();
  for (const slot of representativeSlots(slots, max)) {
    const times = groups.get(slot.barberName) ?? [];
    if (!times.includes(slot.time)) times.push(slot.time);
    groups.set(slot.barberName, times);
  }
  if (groups.size === 1) return [...groups.values()][0].join(", ");
  return [...groups.entries()].map(([barberName, times]) => `${barberName}: ${times.join(", ")}`).join(" · ");
}

export async function composeReply(
  event: WhatsappInboundTextEvent,
  context: CaAtendeRuntimeContext,
  conversation: CaAtendeConversationSnapshot | null,
): Promise<CaAtendeDecision> {
  const oldMemory = safeMemory(conversation?.botContextJson ?? "{}");
  const selectedRememberedChoice = rememberedChoice(event.text, oldMemory.lastChoices);
  if (selectedRememberedChoice) event = { ...event, text:selectedRememberedChoice };
  const normalized = normalizeCaAtendeText(event.text);
  const stage = conversation?.botState || "";
  // Buttons in the laboratory are ordinary text inputs to this same production engine.
  // The future Meta interactive adapter can map a selected option back to its label.
  if (highConfidenceCommercialOffer(event.text) && context.settings.spamFilterEnabled) {
    return { reply:"", intent:"spam", state:"suspected_offer", memory:oldMemory, source:"rule", spam:true };
  }
  const acknowledgement = /^(ok|blz|beleza|obrigado|obrigada|certo|combinado)$/.test(normalized);
  if (stage === "booking_pix_pending" && acknowledgement) {
    return { reply:"Combinado! O horário aguarda o Pix e a conferência da barbearia.", intent:"booking", state:"", memory:{}, source:"rule" };
  }
  if (acknowledgement && stage === "awaiting_confirmation") {
    return { reply:"Certo. Para fechar esse horário, escreva “confirmar” ou escolha Confirmar.", intent:oldMemory.intent || "booking", state:stage, memory:oldMemory, source:"rule", dataSource:"agenda", choices:["Confirmar", "Escolher outro horário", "Trocar profissional", "Cancelar"] };
  }
  if (acknowledgement && stage === "awaiting_payment") {
    const payments = await bookingPaymentChoices(context);
    return { reply:"Certo. Só falta me dizer como prefere pagar.", intent:"booking", state:stage, memory:oldMemory, source:"rule", choices:payments, dataSource:"agenda" };
  }
  if (acknowledgement && (stage === "awaiting_service" || stage === "awaiting_professional" || stage === "awaiting_booking_details" || stage === "awaiting_booking_choice" || stage === "awaiting_availability_details")) {
    const reply = stage === "awaiting_service" ? "Certo. Qual serviço você quer?"
      : stage === "awaiting_professional" ? "Certo. Qual profissional você prefere?"
        : stage === "awaiting_booking_choice" ? "Certo. Qual horário você prefere?"
          : "Certo. Continuamos daqui — me diga só o detalhe que falta.";
    return { reply, intent:oldMemory.intent || "booking", state:stage, memory:oldMemory, source:"rule", dataSource:"agenda" };
  }
  if (normalized === "ver opcoes" || normalized === "opcoes" || normalized === "menu") return menuDecision(context);
  if (normalized === "agendar horario" || normalized === "agendar pelo link") {
    if (normalized === "agendar pelo link") {
      return { reply:bookingLink(context.organization.slug), intent:"booking", state:"", memory:{}, source:"rule" };
    }
    return { reply:"Qual serviço você quer?", intent:"booking", state:"awaiting_service", memory:{ intent:"booking" }, source:"rule", choices:serviceChoices(context) };
  }
  if (normalized === "cancelar ou remarcar") {
    return { reply:"Claro. Você quer cancelar ou remarcar seu horário?", intent:"cancel", state:"cancel_choice", memory:{}, source:"rule", choices:["Cancelar horário", "Remarcar horário"] };
  }
  if (normalized === "falar com a barbearia") {
    return { reply:defaultHandoff(context), intent:"human", state:"human_takeover", memory:oldMemory, source:"rule", handoff:true };
  }
  if (normalized === "ver horarios disponiveis") {
    return { reply:"Qual serviço e qual dia você procura? Pode me dizer também o profissional, se tiver preferência.", intent:"availability", state:"awaiting_availability_details", memory:{ intent:"availability" }, source:"rule", choices:serviceChoices(context) };
  }
  if (normalized === "precos e servicos") {
    // Let the real service query below list the active services.
  }

  if (stage === "awaiting_manage_choice") {
    const action = oldMemory.manageAction === "reschedule" ? "reschedule" : "cancel";
    const appointments = (await listWhatsappManagedBookings(context.organization.slug, event.phone)).filter((item) => item.canChange);
    const selected = chooseManagedBooking(event.text, appointments);
    if (!selected) return { reply:"Não consegui identificar qual horário. Responda pelo número, dia ou horário:", intent:action, state:"awaiting_manage_choice", memory:oldMemory, source:"rule", choices:managedBookingChoices(appointments), dataSource:"agenda" };
    return managementPrompt(action, selected);
  }
  if (stage === "awaiting_cancel_confirmation") {
    if (/\b(manter|nao cancelar|voltar|deixa assim)\b/.test(normalized)) return menuDecision(context);
    if (/\b(confirmar cancelamento|pode cancelar|cancela|cancelar|sim)\b/.test(normalized) && oldMemory.appointmentId) {
      return { reply:"", intent:"cancel", state:"management_commit", memory:oldMemory, source:"rule", dataSource:"agenda", managementRequest:{ action:"cancel", appointmentId:oldMemory.appointmentId } };
    }
    return { reply:"Quer mesmo cancelar esse horário?", intent:"cancel", state:"awaiting_cancel_confirmation", memory:oldMemory, source:"rule", choices:["Confirmar cancelamento", "Manter horário"], dataSource:"agenda" };
  }
  if (stage === "awaiting_reschedule_date") {
    const date = extractCaAtendeDate(event.text);
    if (!date) return { reply:"Para qual dia você quer remarcar?", intent:"reschedule", state:"awaiting_reschedule_date", memory:oldMemory, source:"rule", choices:bookingDayChoices(), dataSource:"agenda" };
    const appointments = await listWhatsappManagedBookings(context.organization.slug, event.phone);
    const current = appointments.find((item) => item.appointmentId === oldMemory.appointmentId);
    if (!current) return { reply:"Não encontrei mais esse horário. Posso chamar a barbearia se precisar.", intent:"reschedule", state:"", memory:{}, source:"rule", dataSource:"agenda" };
    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    if (!slots.length) return { reply:`Não encontrei horário livre com ${current.barberName} em ${humanDate(date)}. Me diga outro dia.`, intent:"reschedule", state:"awaiting_reschedule_date", memory:oldMemory, source:"rule", dataSource:"agenda" };
    const visibleSlots = representativeSlots(slots, 8);
    return { reply:`Alguns horários livres são ${visibleSlots.map((slot) => slot.time).join(", ")}. Se quiser outro, pode digitar o horário.`, intent:"reschedule", state:"awaiting_reschedule_time", memory:{ ...oldMemory, date, time:"" }, source:"rule", choices:visibleSlots.map((slot) => slot.time), dataSource:"agenda" };
  }
  if (stage === "awaiting_reschedule_time") {
    const time = extractCaAtendeTime(event.text);
    const date = oldMemory.date || "";
    const appointments = await listWhatsappManagedBookings(context.organization.slug, event.phone);
    const current = appointments.find((item) => item.appointmentId === oldMemory.appointmentId);
    if (!current || !date) return { reply:"Perdi os detalhes desse horário. Me diga que quer remarcar e eu começo de novo.", intent:"reschedule", state:"", memory:{}, source:"rule" };
    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    const exact = slots.find((slot) => slot.time === time);
    const visibleSlots = representativeSlots(slots, 8);
    if (!time || !exact) return { reply:`Esse horário não está livre. Alguns horários livres são ${visibleSlots.map((slot) => slot.time).join(", ")}. Se quiser outro, pode digitar o horário.`, intent:"reschedule", state:"awaiting_reschedule_time", memory:oldMemory, source:"rule", choices:visibleSlots.map((slot) => slot.time), dataSource:"agenda" };
    const memory = { ...oldMemory, date, time };
    return { reply:`Certo. Remarcar ${current.serviceName} com ${current.barberName} para ${humanDate(date)} às ${time}. Confirma?`, intent:"reschedule", state:"awaiting_reschedule_confirmation", memory, source:"rule", choices:["Confirmar remarcação", "Escolher outro horário", "Cancelar alteração"], dataSource:"agenda" };
  }
  if (stage === "awaiting_reschedule_confirmation") {
    if (/\b(cancelar alteracao|desistir|voltar)\b/.test(normalized)) return menuDecision(context);
    if (/\b(escolher outro horario|outro horario)\b/.test(normalized)) return { reply:"Qual outro horário você prefere?", intent:"reschedule", state:"awaiting_reschedule_time", memory:{ ...oldMemory, time:"" }, source:"rule", dataSource:"agenda" };
    if (/\b(confirmar remarcacao|confirmar|confirma|sim|pode remarcar|remarca)\b/.test(normalized) && oldMemory.appointmentId && oldMemory.date && oldMemory.time) {
      return { reply:"", intent:"reschedule", state:"management_commit", memory:oldMemory, source:"rule", dataSource:"agenda", managementRequest:{ action:"reschedule", appointmentId:oldMemory.appointmentId, date:oldMemory.date, time:oldMemory.time } };
    }
    return { reply:"Confirma essa remarcação?", intent:"reschedule", state:"awaiting_reschedule_confirmation", memory:oldMemory, source:"rule", choices:["Confirmar remarcação", "Escolher outro horário", "Cancelar alteração"], dataSource:"agenda" };
  }

  if (stage === "awaiting_confirmation" && normalized === "cancelar") return menuDecision(context);
  if (stage === "awaiting_confirmation" && normalized === "escolher outro horario") {
    return { reply:"Qual outro horário você prefere?", intent:oldMemory.intent || "booking", state:"awaiting_booking_choice", memory:{ ...oldMemory, time:"" }, source:"rule" };
  }
  if (stage === "awaiting_client_name") {
    const clientName = safeClientName(event.text);
    if (!clientName) {
      return { reply:"Me diga somente seu nome para eu concluir o agendamento.", intent:"booking", state:"awaiting_client_name", memory:oldMemory, source:"rule" };
    }
    const payments = await bookingPaymentChoices(context);
    if (!payments.length) {
      return { reply:"Não encontrei uma forma de pagamento liberada para concluir agora. Vou chamar alguém da barbearia.", intent:"human", state:"human_takeover", memory:{ ...oldMemory, clientName }, source:"rule", handoff:true };
    }
    const baseMemory = mergeCaAtendeMemory(oldMemory, { clientName });
    if (payments.length > 1) {
      return { reply:"Perfeito. Como prefere pagar?", intent:"booking", state:"awaiting_payment", memory:baseMemory, source:"rule", choices:payments };
    }
    const readyMemory = mergeCaAtendeMemory(baseMemory, { paymentChoice:payments[0] });
    const request = bookingRequestFromMemory(context, readyMemory);
    if (!request) return { reply:"Perdi algum detalhe do horário. Me diga novamente o serviço, dia e horário que você quer.", intent:"booking", state:"awaiting_booking_details", memory:readyMemory, source:"rule" };
    return { reply:"", intent:"booking", state:"booking_commit", memory:readyMemory, source:"rule", bookingRequest:request };
  }
  if (stage === "awaiting_payment") {
    const payments = await bookingPaymentChoices(context);
    const paymentChoice = paymentChoiceFromText(event.text, payments);
    if (!paymentChoice) {
      return { reply:"Qual forma de pagamento você prefere?", intent:"booking", state:"awaiting_payment", memory:oldMemory, source:"rule", choices:payments };
    }
    const readyMemory = mergeCaAtendeMemory(oldMemory, { paymentChoice });
    const request = bookingRequestFromMemory(context, readyMemory);
    if (!request) return { reply:"Perdi algum detalhe do horário. Me diga novamente o serviço, dia e horário que você quer.", intent:"booking", state:"awaiting_booking_details", memory:readyMemory, source:"rule" };
    return { reply:"", intent:"booking", state:"booking_commit", memory:readyMemory, source:"rule", bookingRequest:request };
  }
  if (normalized === "quero ajuda por aqui" || normalized === "ver outros servicos") {
    const offset = normalized === "ver outros servicos" ? (stage.startsWith("services_page:") ? Number(stage.split(":")[1]) || 5 : 5) : 0;
    return { reply:normalized === "ver outros servicos" ? "Mais serviços da barbearia:" : "Qual serviço você quer?", intent:"booking", state:normalized === "ver outros servicos" ? `services_page:${offset + 5}` : "awaiting_service", memory:normalized === "ver outros servicos" ? oldMemory : { intent:"booking" }, source:"rule", choices:serviceChoices(context, offset) };
  }
  if (normalized === "qualquer profissional") {
    if (!oldMemory.service) return { reply:"Qual serviço você quer?", intent:"booking", state:"awaiting_service", memory:oldMemory, source:"rule", choices:serviceChoices(context) };
    if (!oldMemory.date) return { reply:"Combinado, vou olhar todos os profissionais. Qual dia você prefere?", intent:oldMemory.intent || "booking", state:"awaiting_booking_details", memory:{ ...oldMemory, barber:"" }, source:"rule", choices:bookingDayChoices() };
  }
  const durationService = findServiceByMessage(event.text, context.services);
  if (asksForDuration(event.text) || (stage === "awaiting_duration_service" && durationService)) {
    const directService = durationService;
    const previousService = oldMemory.service ? findNamedItem(oldMemory.service, oldMemory.service, context.services) : null;
    const selected = directService || (refersToPreviousService(event.text) ? previousService : null);
    if (selected) return { reply:`${selected.name} leva cerca de ${selected.durationMinutes} minutos.`, intent:"duration", state:stage === "awaiting_duration_service" ? "" : stage, memory:oldMemory, source:"rule", dataSource:"services" };
    return { reply:"De qual serviço você quer saber a duração?", intent:"duration", state:"awaiting_duration_service", memory:oldMemory, source:"rule", dataSource:"services", choices:serviceChoices(context) };
  }
  const serviceSignals = serviceIntentSignals(event.text);
  if (serviceSignals.mentionsCut && serviceSignals.mentionsBeard && !serviceSignals.rejectBeard && !serviceSignals.rejectCut && !findServiceByMessage(event.text, context.services)) {
    return { reply:"Não encontrei corte com barba como um serviço único aqui. Qual serviço você prefere?", intent:"booking", state:"awaiting_service", memory:{ ...oldMemory, intent:"booking", service:"" }, source:"rule", choices:serviceChoices(context) };
  }
  const interpreted = await interpretationFor(event.text, context, oldMemory, stage);
  const continuationDate = extractCaAtendeDate(event.text);
  const continuationTime = extractCaAtendeTime(event.text);
  const timeWindow = extractCaAtendeTimeWindow(event.text);
  const explicitService = findServiceByMessage(event.text, context.services);
  const explicitBarber = normalized === "qualquer profissional" ? null : findNamedItem(event.text, "", context.barbers);
  const rememberedService = oldMemory.service ? findNamedItem(oldMemory.service, oldMemory.service, context.services) : null;
  const rememberedBarber = oldMemory.barber ? findNamedItem(oldMemory.barber, oldMemory.barber, context.barbers) : null;
  const aiService = !rememberedService && interpreted.service ? findNamedItem(interpreted.service, interpreted.service, context.services) : null;
  const aiBarber = !rememberedBarber && interpreted.barber ? findNamedItem(interpreted.barber, interpreted.barber, context.barbers) : null;
  const service = explicitService || rememberedService || aiService;
  const barber = explicitBarber || rememberedBarber || aiBarber;
  const changingProfessional = wantsAnotherProfessional(event.text) || normalized === "trocar profissional";
  const confirmingBooking = wantsBookingConfirmation(event.text);
  const bookingState = stage === "awaiting_booking_details" || stage === "awaiting_booking_choice" || stage === "awaiting_availability_details" || stage === "awaiting_service" || stage === "awaiting_professional" || stage === "awaiting_confirmation" || stage === "awaiting_client_name" || stage === "awaiting_payment" || stage === "booking_commit" || stage.startsWith("services_page:") || stage === "test_confirmation";

  let intent = interpreted.intent;
  if (barber && !explicitHumanRequest(event.text) && (intent === "human" || intent === "unknown")) {
    intent = oldMemory.intent === "availability" ? "availability" : "booking";
  }
  if ((intent === "unknown" || intent === "greeting") && bookingState && (service || barber || continuationDate || continuationTime || timeWindow.afterTime || timeWindow.beforeTime || wantsAssistedBooking(event.text) || changingProfessional || confirmingBooking)) {
    intent = oldMemory.intent === "availability" ? "availability" : "booking";
  }
  if (wantsAssistedBooking(event.text) && intent === "unknown") intent = "booking";
  if (stage === "awaiting_price_service" && explicitService) intent = "prices";
  if (normalized === "precos e servicos") intent = "prices";
  if (stage === "booking_method" && intent === "unknown") intent = "booking";
  if (explicitHumanRequest(event.text) && /\b(falar|conversar|chamar)\b/.test(normalized) && intent === "unknown" && !wantsAnotherProfessional(event.text)) intent = "human";

  const memory = mergeCaAtendeMemory(oldMemory, {
    intent: intent === "unknown" ? oldMemory.intent : intent,
    date: interpreted.date || continuationDate,
    time: interpreted.time || continuationTime,
    service: explicitService?.name || oldMemory.service || aiService?.name || "",
    barber: changingProfessional ? "" : (explicitBarber?.name || oldMemory.barber || aiBarber?.name || ""),
  });

  if (intent === "spam") return { reply:"", intent, state:"suspected_offer", memory, source:interpreted.source, spam:true };

  if (intent === "human" && explicitHumanRequest(event.text)) {
    return { reply:defaultHandoff(context), intent, state:"human_takeover", memory, source:interpreted.source, handoff:true };
  }

  if (intent === "cancel") return beginManagementFlow("cancel", event, context, interpreted.source);
  if (intent === "reschedule") return beginManagementFlow("reschedule", event, context, interpreted.source);

  if (intent === "greeting") {
    return { reply:defaultGreeting(context), intent, state:"menu", memory:{}, source:interpreted.source };
  }

  if (intent === "prices") {
    if (!context.services.length) {
      return { reply:"Os serviços e preços ainda não estão cadastrados por aqui.", intent, state:"", memory:{}, source:interpreted.source, dataSource:"services" };
    }
    const wantsList = ["precos e servicos", "precos", "valores"].includes(normalized)
      || /\b(quais (os )?(precos|valores)|tabela|lista de servicos|quais servicos|todos os precos)\b/.test(normalized);
    const selectedService = wantsList ? null : explicitService || (refersToPreviousService(event.text) ? rememberedService : null);
    if (selectedService) {
      return {
        reply:`${selectedService.name} custa ${formatCaAtendeMoney(selectedService.priceCents)}. Se quiser, eu também posso consultar os horários disponíveis pra você.`,
        intent,
        state:"",
        memory:{ service:selectedService.name, intent:"prices" },
        source:interpreted.source,
        dataSource:"services",
      };
    }
    if (!wantsList) return { reply:"Qual serviço você quer saber o preço?", intent, state:"awaiting_price_service", memory:{ intent:"prices" }, source:"rule", dataSource:"services", choices:serviceChoices(context) };
    const rows = context.services.slice(0,8).map(item => `• ${item.name}: ${formatCaAtendeMoney(item.priceCents)}`);
    const more = context.services.length > 8 ? "\nSe quiser um serviço específico, me fala o nome que eu te passo só aquele valor." : "";
    return {
      reply:`Valores da ${context.organization.name}:\n${rows.join("\n")}${more}`,
      intent,
      state:"",
      memory:{},
      source:interpreted.source,
      dataSource:"services",
    };
  }

  const continuingBooking = intent === "booking" || intent === "availability" || bookingState;
  if (continuingBooking) {
    const selectedService = explicitService || rememberedService || aiService || findNamedItem(memory.service || "", memory.service || "", context.services);
    const previousBarber = rememberedBarber;
    const selectedBarber = changingProfessional ? null : (explicitBarber || rememberedBarber || aiBarber || findNamedItem(memory.barber || "", memory.barber || "", context.barbers));
    const date = interpreted.date || continuationDate || memory.date || "";
    const desiredTime = timeWindow.afterTime || timeWindow.beforeTime ? "" : interpreted.time || continuationTime || memory.time || "";
    const preservedIntent = intent === "availability" ? "availability" : "booking";
    const nextMemory = mergeCaAtendeMemory(memory, {
      intent: preservedIntent,
      service: selectedService?.name || "",
      barber: changingProfessional ? "" : (selectedBarber?.name || ""),
      date,
      time: desiredTime,
      afterTime: timeWindow.afterTime || oldMemory.afterTime || "",
      beforeTime: timeWindow.beforeTime || oldMemory.beforeTime || "",
    });
    if (timeWindow.afterTime || timeWindow.beforeTime) nextMemory.time = "";
    if (changingProfessional || normalized === "qualquer profissional") nextMemory.barber = "";

    if (!selectedService) {
      return { reply:"Qual serviço você quer?", intent:preservedIntent, state:"awaiting_service", memory:nextMemory, source:"rule", choices:serviceChoices(context) };
    }
    if ((stage === "awaiting_service" || stage.startsWith("services_page:")) && !date) {
      return { reply:`${selectedService.name}, certo. Tem preferência de profissional?`, intent:preservedIntent, state:"awaiting_professional", memory:nextMemory, source:"rule", choices:professionalChoices(context) };
    }
    if (stage === "awaiting_professional" && !date && (explicitBarber || normalized === "qualquer profissional")) {
      return { reply:`Perfeito. ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""}. Qual dia você prefere?`, intent:preservedIntent, state:"awaiting_booking_details", memory:nextMemory, source:"rule", choices:bookingDayChoices() };
    }

    if (!date) {
      return {
        reply:`${changingProfessional ? "Claro, podemos trocar de profissional. " : ""}Certo, ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""}. Qual dia você prefere?`,
        intent: preservedIntent,
        state:"awaiting_booking_details",
        memory:nextMemory,
        source:"rule",
        choices:bookingDayChoices(),
      };
    }

    if (confirmingBooking && selectedService && date && desiredTime && (stage === "awaiting_confirmation" || stage === "test_confirmation")) {
      const confirmedBarber = selectedBarber || previousBarber;
      const confirmedMemory = mergeCaAtendeMemory(nextMemory, { barber:confirmedBarber?.name || "" });
      if (event.messageRowId === 0) {
        return {
          reply:`Perfeito. Entendi sua confirmação: ${selectedService.name}${confirmedBarber ? ` com ${confirmedBarber.name}` : ""}, ${humanDate(date)} às ${desiredTime}.`,
          intent:preservedIntent, state:"test_confirmation", memory:confirmedMemory, source:"rule", dataSource:"agenda", confirmationRequested:true,
        };
      }
      if (!confirmedBarber) {
        return { reply:"Qual profissional você prefere para eu concluir?", intent:preservedIntent, state:"awaiting_professional", memory:confirmedMemory, source:"rule", choices:professionalChoices(context) };
      }
      const clientName = safeClientName(confirmedMemory.clientName) || safeClientName(event.senderName);
      if (!clientName) {
        return {
          reply:"Perfeito. Antes de concluir, qual seu nome? Não precisa repetir serviço, profissional, dia nem horário.",
          intent:preservedIntent, state:"awaiting_client_name", memory:mergeCaAtendeMemory(confirmedMemory, { clientName:"" }), source:"rule", dataSource:"agenda",
        };
      }
      const payments = await bookingPaymentChoices(context);
      if (!payments.length) {
        return { reply:"Seu horário está montado, mas não encontrei uma forma de pagamento liberada. Vou chamar alguém da barbearia para concluir.", intent:"human", state:"human_takeover", memory:mergeCaAtendeMemory(confirmedMemory, { clientName }), source:"rule", handoff:true };
      }
      let paymentChoice = paymentChoiceFromText(confirmedMemory.paymentChoice || "", payments);
      if (!paymentChoice && payments.length === 1) paymentChoice = payments[0];
      if (!paymentChoice) {
        return {
          reply:"Só falta a forma de pagamento. Como prefere pagar?", intent:preservedIntent, state:"awaiting_payment",
          memory:mergeCaAtendeMemory(confirmedMemory, { clientName }), source:"rule", dataSource:"agenda", choices:payments,
        };
      }
      const readyMemory = mergeCaAtendeMemory(confirmedMemory, { clientName, paymentChoice });
      const request = bookingRequestFromMemory(context, readyMemory);
      if (!request) return { reply:"Perdi algum detalhe do horário. Me diga novamente o serviço, dia e horário que você quer.", intent:preservedIntent, state:"awaiting_booking_details", memory:readyMemory, source:"rule" };
      return { reply:"", intent:preservedIntent, state:"booking_commit", memory:readyMemory, source:"rule", dataSource:"agenda", bookingRequest:request };
    }

    try {
      let slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, selectedService.id, selectedBarber?.id ?? 0);
      if (changingProfessional && previousBarber) slots = slots.filter(slot => normalizeCaAtendeText(slot.barberName) !== normalizeCaAtendeText(previousBarber.name));
      const afterTime = timeWindow.afterTime || oldMemory.afterTime || "";
      const beforeTime = timeWindow.beforeTime || oldMemory.beforeTime || "";
      if (afterTime) slots = slots.filter(slot => slot.time > afterTime);
      if (beforeTime) slots = slots.filter(slot => slot.time < beforeTime);
      if (!slots.length) {
        const barberText = selectedBarber ? ` com ${selectedBarber.name}` : "";
        return {
          reply:`${changingProfessional ? "Não encontrei outro profissional livre" : `Para ${selectedService.name}${barberText}, não encontrei horário livre`} ${humanDate(date)}. Me diga outro dia que eu consulto pra você.`,
          intent:preservedIntent,
          state:"awaiting_booking_details",
          memory:{ ...nextMemory, afterTime, beforeTime },
          source:interpreted.source,
          dataSource:"agenda",
        };
      }

      const visibleSlots = representativeSlots(slots, 9);
      if (desiredTime) {
        const exact = slots.filter(slot => slot.time === desiredTime);
        if (exact.length) {
          if (!selectedBarber && exact.length > 1) return {
            reply:`Às ${desiredTime} há mais de um profissional livre. Com quem você prefere ${selectedService.name}?`,
            intent:preservedIntent, state:"awaiting_booking_choice", memory:nextMemory, source:"rule", dataSource:"agenda",
            choices:exact.map(slot => `${slot.barberName} · ${slot.time}`),
          };
          const chosen = selectedBarber || context.barbers.find(item => item.id === exact[0].barberId) || null;
          const confirmedMemory = { ...nextMemory, barber:chosen?.name || "", time:desiredTime, afterTime:"" };
          const professionals = [...new Set(exact.map(slot => slot.barberName))];
          const professionalText = selectedBarber
            ? `com ${selectedBarber.name}`
            : professionals.length === 1
              ? `com ${professionals[0]}`
              : `com ${professionals.join(" ou ")}`;
          return {
            reply:`Certo: ${selectedService.name}, ${professionalText}, ${humanDate(date)} às ${desiredTime}. Deseja confirmar?`,
            intent:preservedIntent,
            state:"awaiting_confirmation",
            memory:confirmedMemory,
            source:interpreted.source,
            dataSource:"agenda",
            choices:["Confirmar", "Escolher outro horário", "Trocar profissional", "Cancelar"],
          };
        }
        return {
          reply:`Às ${desiredTime} não está livre para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}. Alguns horários disponíveis são ${changingProfessional && !selectedBarber && visibleSlots.length ? `${visibleSlots[0].barberName}: ` : ""}${slotSummary(visibleSlots)}. Se quiser outro, pode digitar o horário (ex.: 18h).`,
          intent:preservedIntent,
          state:"awaiting_booking_choice",
          memory:{ ...nextMemory, time:"" },
          source:interpreted.source,
          dataSource:"agenda",
          choices:visibleSlots.map(slot => `${slot.barberName} · ${slot.time}`),
        };
      }

      return {
        reply:`${changingProfessional ? "Claro. " : ""}Para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}, alguns horários são ${changingProfessional && !selectedBarber && visibleSlots.length && visibleSlots.every(slot => slot.barberId === visibleSlots[0].barberId) ? `${visibleSlots[0].barberName}: ` : ""}${slotSummary(visibleSlots)}. Qual você prefere? Se quiser outro, pode digitar o horário (ex.: 18h).`,
        intent:preservedIntent,
        state:"awaiting_booking_choice",
        memory:changingProfessional ? { ...nextMemory, barber:"", time:desiredTime, afterTime, beforeTime } : { ...nextMemory, afterTime, beforeTime },
        source:changingProfessional ? "rule" : interpreted.source,
        dataSource:"agenda",
        choices:visibleSlots.map(slot => `${slot.barberName} · ${slot.time}`),
      };
    } catch {
      return {
        reply:"Não consegui consultar a agenda agora. Tenta me mandar o dia e o serviço novamente que eu consulto de novo.",
        intent:preservedIntent,
        state:"awaiting_booking_details",
        memory:nextMemory,
        source:interpreted.source,
        dataSource:"agenda",
      };
    }
  }

  if (!stage) return { reply:defaultGreeting(context), intent:"greeting", state:"menu", memory:{}, source:"rule" };
  return {
    reply:"Me fala do seu jeito o que você precisa que eu tento ajudar.",
    intent:"unknown",
    state:"",
    memory:oldMemory,
    source:interpreted.source,
  };
}

export type CaAtendeTestState = {
  botState: string;
  memory: CaAtendeContextMemory;
  paused: boolean;
  unresolvedTurns: number;
};

export type CaAtendeTestResult = {
  reply: string;
  intent: string;
  source: "rule" | "ai";
  dataSource: "agenda" | "services" | null;
  handoff: boolean;
  silent: boolean;
  silentReason: "commercial_offer" | "human_takeover" | null;
  choices: string[];
  guided: boolean;
  state: CaAtendeTestState;
};

export async function simulateCaAtende(input: {
  organizationId: number;
  message: string;
  state?: Partial<CaAtendeTestState>;
}): Promise<CaAtendeTestResult> {
  const message = input.message.trim().slice(0, 1200);
  if (!message) throw new Error("Escreva uma mensagem para testar.");
  const context = await runtimeContext(input.organizationId);
  if (!context) throw new Error("Barbearia não encontrada.");

  const previousState: CaAtendeTestState = {
    botState: String(input.state?.botState ?? "").slice(0,80),
    memory: input.state?.memory ?? {},
    paused: Boolean(input.state?.paused),
    unresolvedTurns: Math.max(0, Number(input.state?.unresolvedTurns ?? 0)),
  };

  if (previousState.paused) {
    return {
      reply: "",
      intent: "human",
      source: "rule",
      dataSource: null,
      handoff: true,
      silent: true,
      silentReason: "human_takeover",
      choices:[], guided:false,
      state: previousState,
    };
  }

  const rawDecision = await composeReply({
    organizationId: input.organizationId,
    messageRowId: 0,
    providerMessageId: "test",
    phone: "5500000000000",
    text: message,
    receivedAt: new Date().toISOString(),
  }, context, {
    botState: previousState.botState,
    botContextJson: JSON.stringify(previousState.memory ?? {}),
    unresolvedTurns: previousState.unresolvedTurns,
  });
  const guarded = guardedDecision(rawDecision, {
    botState: previousState.botState,
    botContextJson: JSON.stringify(previousState.memory ?? {}),
    unresolvedTurns: previousState.unresolvedTurns,
  }, context);
  const decision = guarded.decision;

  const testReply = decision.confirmationRequested
    ? `Perfeito. Eu entendi sua confirmação: ${decision.memory.service || "serviço"}${decision.memory.barber ? ` com ${decision.memory.barber}` : ""}, ${decision.memory.date ? humanDate(decision.memory.date) : "no dia escolhido"}${decision.memory.time ? ` às ${decision.memory.time}` : ""}. No modo teste eu não altero sua agenda, então nenhum horário real foi criado.`
    : decision.reply;
  const stateMemory = { ...decision.memory, lastChoices:safeChoices(decision.choices) };

  return {
    reply: testReply,
    intent: decision.intent,
    source: decision.source,
    dataSource: decision.dataSource ?? null,
    handoff: Boolean(decision.handoff),
    silent: Boolean(decision.spam),
    silentReason: decision.spam ? "commercial_offer" : null,
    choices:decision.choices ?? [],
    guided:Boolean(decision.choices?.length),
    state: {
      botState: decision.state,
      memory: stateMemory,
      paused: Boolean(decision.handoff),
      unresolvedTurns: guarded.unresolvedTurns,
    },
  };
}

export async function processCaAtendeInbound(event: WhatsappInboundTextEvent) {
  const context = await runtimeContext(event.organizationId);
  if (!context) return { handled:false, reason:"organization_not_found" as const };
  const entitlement = await getWhatsappEntitlementForOrganization(event.organizationId);
  if (!context.settings.enabled || !context.settings.botEnabled || !context.connected || !entitlement.hasAccess) {
    return { handled:false, reason:"bot_inactive" as const };
  }

  const conversation = await conversationState(event.organizationId, event.phone);
  if (isPaused(conversation)) return { handled:false, reason:"human_takeover" as const };

  const rawDecision = await composeReply(event, context, conversation);
  const guarded = guardedDecision(rawDecision, conversation, context);
  let decision = guarded.decision;
  const now = new Date().toISOString();

  if (decision.managementRequest) {
    const request = decision.managementRequest;
    if (event.messageRowId === 0) {
      decision = { ...decision, reply:"No modo teste eu não altero horários reais.", state:"", memory:{}, managementRequest:undefined, choices:[] };
    } else {
      try {
        if (request.action === "cancel") {
          const cancelled = await cancelWhatsappManagedBooking(context.organization.slug, event.phone, request.appointmentId, { skipWhatsappNotice:true });
          decision = { ...decision, reply:`Pronto. Seu ${cancelled.serviceName} com ${cancelled.barberName}, ${humanDate(cancelled.date)} às ${cancelled.time}, foi cancelado.`, state:"", memory:{}, managementRequest:undefined, choices:[] };
        } else {
          const rescheduled = await rescheduleWhatsappManagedBooking(context.organization.slug, event.phone, request.appointmentId, String(request.date || ""), String(request.time || ""), { skipWhatsappNotice:true });
          const when = `${humanDate(rescheduled.date)} às ${rescheduled.time}`;
          const reply = rescheduled.status === "Aguardando" ? `Pronto. Sua remarcação para ${when} foi registrada e está aguardando confirmação da barbearia.` : `Pronto. Seu horário foi remarcado para ${when}.`;
          decision = { ...decision, reply, state:"", memory:{}, managementRequest:undefined, choices:[] };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não consegui alterar o horário.";
        const needsHuman = /menos de 2 horas/i.test(message);
        decision = { ...decision, reply:message, state:needsHuman ? "human_takeover" : "", memory:{}, managementRequest:undefined, choices:needsHuman ? [] : ["Ver opções"], handoff:needsHuman };
      }
    }
  }

  if (decision.bookingRequest) {
    const request = decision.bookingRequest;
    try {
      const booking = await createPublicBooking(context.organization.slug, {
        ...request,
        phone:event.phone,
      }, { source:"ca_atende", skipImmediateWhatsappConfirmation:true });
      const when = `${humanDate(request.date)} às ${request.time}`;
      let reply = `Pronto! ${booking.serviceName} com ${booking.barberName} ficou agendado para ${when}.`;
      if (booking.status === "Aguardando") {
        reply = `Pronto! Seu pedido de ${booking.serviceName} com ${booking.barberName} para ${when} foi registrado e está aguardando confirmação da barbearia.`;
      } else if (booking.status === "Aguardando pagamento") {
        reply = `Separei ${booking.serviceName} com ${booking.barberName} para ${when}. O agendamento está aguardando o pagamento por Pix.${booking.pixKey ? ` Chave Pix: ${booking.pixKey}.` : ""}`;
      }
      decision = { ...decision, reply, state:booking.status === "Aguardando pagamento" ? "booking_pix_pending" : "", memory:{}, bookingRequest:undefined, confirmationRequested:false, choices:[] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir o agendamento.";
      if (/acabou de ser ocupado/i.test(message)) {
        const slots = await getPublicBookingSlotsExpanded(context.organization.slug, request.date, request.serviceId, request.barberId).catch(() => []);
        const alternatives = slots.filter(slot => slot.time !== request.time).slice(0, 6);
        decision = {
          ...decision,
          reply:alternatives.length
            ? `Esse horário acabou de ser ocupado. Tenho ${slotSummary(alternatives)}. Qual desses fica melhor?`
            : "Esse horário acabou de ser ocupado e não encontrei outro próximo agora. Me diga outro horário ou outro dia.",
          state:"awaiting_booking_choice",
          memory:{ ...decision.memory, time:"" },
          bookingRequest:undefined,
          confirmationRequested:false,
          choices:alternatives.map(slot => `${slot.barberName} · ${slot.time}`),
        };
      } else {
        decision = {
          ...decision,
          reply:`Não consegui concluir o agendamento agora: ${message} Me diga se quer tentar outro horário.`,
          state:"awaiting_confirmation",
          bookingRequest:undefined,
          confirmationRequested:false,
          choices:["Confirmar", "Escolher outro horário", "Cancelar"],
        };
      }
    }
  }

  decision = {
    ...decision,
    memory:{ ...decision.memory, lastChoices:safeChoices(decision.choices) },
  };

  if (decision.spam) {
    await updateConversation({
      organizationId:event.organizationId,
      phone:event.phone,
      intent:decision.intent,
      state:decision.state,
      memory:decision.memory,
      suspectedOfferAt:now,
      unresolvedTurns:guarded.unresolvedTurns,
    });
    return { handled:true, replied:false, reason:"suspected_offer" as const };
  }

  const queued = await queueWhatsappTextReply({
    organizationId:event.organizationId,
    phone:event.phone,
    // Text equivalent until official Meta interactive payloads are reviewed and enabled.
    text:decision.choices?.length ? `${decision.reply}\n\n*Digite somente o número da opção desejada.*\n${decision.choices.map((choice,index) => formatChoiceLine(choice,index)).join("\n")}` : decision.reply,
    inboundProviderMessageId:event.providerMessageId,
  });
  if (!queued.queued) return { handled:false, reason:queued.reason };

  await updateConversation({
    organizationId:event.organizationId,
    phone:event.phone,
    intent:decision.intent,
    state:decision.state,
    memory:decision.memory,
    replyAt:now,
    humanRequestedAt:decision.handoff ? now : undefined,
    indefiniteHandoff:Boolean(decision.handoff),
    unresolvedTurns:guarded.unresolvedTurns,
  });

  if (decision.handoff) {
    await notifyOwnersOfWhatsappHandoff({
      organizationId:event.organizationId,
      messageId:event.messageRowId,
      phone:event.phone,
      preview:event.text,
    });
  }

  await processWhatsappQueueSafely(event.organizationId, 1);
  return { handled:true, replied:true, handoff:Boolean(decision.handoff), intent:decision.intent };
}

export async function processCaAtendeInboundSafely(event: WhatsappInboundTextEvent) {
  try {
    return await processCaAtendeInbound(event);
  } catch (error) {
    console.error("ca_atende_inbound_failed", { type:error instanceof Error ? error.name : "Unknown" });
    return { handled:false, reason:"processing_error" as const };
  }
}
