import { and, eq, isNull } from "drizzle-orm";
import { appDate } from "../lib/app-date";
import {
  classifyCaAtendeByRule,
  extractCaAtendeDate,
  extractCaAtendeTime,
  formatCaAtendeMoney,
  highConfidenceCommercialOffer,
  mergeCaAtendeMemory,
  normalizeCaAtendeText,
  type CaAtendeContextMemory,
  type CaAtendeInterpretation,
} from "../lib/ca-atende";
import { interpretCaAtendeWithAi } from "../lib/ca-atende-model";
import { getPublicBookingSlotsExpanded } from "./public-booking";
import { getDb } from "./index";
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
    economyMode: boolean;
    bookingLinkFirst: boolean;
    spamFilterEnabled: boolean;
    aiFallbackEnabled: boolean;
    greetingText: string;
    handoffText: string;
    monthlyMessageLimit: number;
  };
  connected: boolean;
};

function appBaseUrl() {
  const configured = String(process.env.PUBLIC_BOOKING_BASE_URL ?? process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!configured || !/^https:\/\//i.test(configured)) return "https://cortouanotou.com.br";
  try {
    if (/\.railway\.app$/i.test(new URL(configured).hostname)) return "https://cortouanotou.com.br";
    return configured;
  } catch {
    return "https://cortouanotou.com.br";
  }
}

function bookingLink(slug: string) {
  return `${appBaseUrl()}/agendar/${encodeURIComponent(slug)}`;
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

function findServiceByMessage(message: string, items: CaAtendeRuntimeContext["services"]) {
  const direct = findNamedItem(message, "", items);
  if (direct) return direct;
  const text = normalizeCaAtendeText(message);
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
  if (custom) return custom
    .replaceAll("{barbearia}", context.organization.name)
    .replaceAll("{link}", link)
    .slice(0,3500);
  return `Olá! Seja bem-vindo à ${context.organization.name}. Para marcar seu horário é bem rapidinho: acesse ${link} e escolha o melhor horário para você. Se preferir atendimento por aqui, me diga o que precisa.`;
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
      economyMode: current?.economyMode === undefined ? true : Boolean(current.economyMode),
      bookingLinkFirst: current?.bookingLinkFirst === undefined ? true : Boolean(current.bookingLinkFirst),
      spamFilterEnabled: current?.spamFilterEnabled === undefined ? true : Boolean(current.spamFilterEnabled),
      aiFallbackEnabled: current?.aiFallbackEnabled === undefined ? true : Boolean(current.aiFallbackEnabled),
      greetingText: String(current?.greetingText ?? ""),
      handoffText: String(current?.handoffText ?? ""),
      monthlyMessageLimit: Number(current?.monthlyMessageLimit ?? 0),
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
      ...(input.indefiniteHandoff ? { automationPausedUntil: null, pauseReason: "human_takeover" } : {}),
      updatedAt: now,
    },
  });
}

async function interpretationFor(message: string, context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory) {
  let interpretation = classifyCaAtendeByRule(message);
  if (context.settings.spamFilterEnabled && highConfidenceCommercialOffer(message)) return { ...interpretation, intent:"spam" as const };

  const normalized = normalizeCaAtendeText(message);
  const knownService = context.services.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const knownBarber = context.barbers.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const bookingContinuation = (memory.intent === "booking" || memory.intent === "availability")
    && (knownService || knownBarber || Boolean(extractCaAtendeDate(message)) || Boolean(extractCaAtendeTime(message)) || wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message));
  if (interpretation.intent === "unknown" && bookingContinuation) {
    return { ...interpretation, intent: memory.intent as "booking" | "availability" };
  }

  if (interpretation.intent === "unknown" && context.settings.aiFallbackEnabled) {
    const ai = await interpretCaAtendeWithAi({
      message,
      organizationName: context.organization.name,
      services: context.services.map(item => item.name),
      barbers: context.barbers.map(item => item.name),
      memory,
    });
    if (ai) interpretation = ai;
  }
  return interpretation;
}

type CaAtendeConversationSnapshot = {
  botState?: string | null;
  botContextJson?: string | null;
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
};

function explicitHumanRequest(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(falar|conversar|chamar|atendente|humano|responsavel|proprietario|dono)\b/.test(text);
}

function wantsAssistedBooking(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(resolver por aqui|por aqui mesmo|quero fazer por aqui|nao quero o link|nao quero clicar|sem link)\b/.test(text);
}

function wantsAnotherProfessional(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(outro profissional|outra pessoa|outro barbeiro|outra barbeira|tem outro|com outro)\b/.test(text);
}

function wantsBookingConfirmation(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(confirma|confirmar|confirma pra mim|pode marcar|marca pra mim|marque pra mim|quero que voce marque|pode agendar|agende pra mim|pode fechar|fecha pra mim)\b/.test(text);
}

function humanDate(value: string) {
  if (value === appDate()) return "hoje";
  return value.split("-").reverse().join("/");
}

function slotSummary(slots: Array<{ time: string; barberId: number; barberName: string }>, max = 6) {
  return slots.slice(0,max).map(slot => `${slot.time} com ${slot.barberName}`).join(", ");
}

async function composeReply(
  event: WhatsappInboundTextEvent,
  context: CaAtendeRuntimeContext,
  conversation: CaAtendeConversationSnapshot | null,
): Promise<CaAtendeDecision> {
  const oldMemory = safeMemory(conversation?.botContextJson ?? "{}");
  const interpreted = await interpretationFor(event.text, context, oldMemory);
  const continuationDate = extractCaAtendeDate(event.text);
  const continuationTime = extractCaAtendeTime(event.text);
  const explicitService = findServiceByMessage(event.text, context.services);
  const explicitBarber = findNamedItem(event.text, "", context.barbers);
  const rememberedService = oldMemory.service ? findNamedItem(oldMemory.service, oldMemory.service, context.services) : null;
  const rememberedBarber = oldMemory.barber ? findNamedItem(oldMemory.barber, oldMemory.barber, context.barbers) : null;
  const aiService = !rememberedService && interpreted.service ? findNamedItem(interpreted.service, interpreted.service, context.services) : null;
  const aiBarber = !rememberedBarber && interpreted.barber ? findNamedItem(interpreted.barber, interpreted.barber, context.barbers) : null;
  const service = explicitService || rememberedService || aiService;
  const barber = explicitBarber || rememberedBarber || aiBarber;
  const changingProfessional = wantsAnotherProfessional(event.text);
  const confirmingBooking = wantsBookingConfirmation(event.text);
  const bookingState = conversation?.botState === "awaiting_booking_details" || conversation?.botState === "awaiting_booking_choice" || conversation?.botState === "awaiting_availability_details" || conversation?.botState === "test_confirmation";

  let intent = interpreted.intent;
  if (barber && !explicitHumanRequest(event.text) && (intent === "human" || intent === "unknown")) {
    intent = oldMemory.intent === "availability" ? "availability" : "booking";
  }
  if ((intent === "unknown" || intent === "greeting") && bookingState && (service || barber || continuationDate || continuationTime || wantsAssistedBooking(event.text) || changingProfessional || confirmingBooking)) {
    intent = oldMemory.intent === "availability" ? "availability" : "booking";
  }
  if (wantsAssistedBooking(event.text) && intent === "unknown") intent = "booking";

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

  if (intent === "cancel" || intent === "reschedule") {
    return { reply:defaultHandoff(context), intent, state:"human_takeover", memory, source:interpreted.source, handoff:true };
  }

  if (intent === "greeting") {
    return { reply:defaultGreeting(context), intent, state:"", memory:{}, source:interpreted.source };
  }

  if (intent === "prices") {
    if (!context.services.length) {
      return { reply:`Os valores ainda não estão disponíveis por aqui. Você pode conferir a agenda em ${bookingLink(context.organization.slug)}.`, intent, state:"", memory:{}, source:interpreted.source, dataSource:"services" };
    }
    const selectedService = service || findNamedItem(memory.service || "", memory.service || "", context.services);
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
    const desiredTime = interpreted.time || continuationTime || memory.time || "";
    const preservedIntent = intent === "availability" ? "availability" : "booking";
    const nextMemory = mergeCaAtendeMemory(memory, {
      intent: preservedIntent,
      service: selectedService?.name || "",
      barber: changingProfessional ? "" : (selectedBarber?.name || ""),
      date,
      time: desiredTime,
    });

    if (!selectedService || !date) {
      const missing: string[] = [];
      if (!selectedService) missing.push("qual serviço você quer");
      if (!date) missing.push("qual dia");
      const known: string[] = [];
      if (selectedBarber) known.push(`com ${selectedBarber.name}`);
      if (desiredTime) known.push(`às ${desiredTime}`);
      return {
        reply:`${changingProfessional ? "Claro, podemos trocar de profissional. " : ""}${known.length ? `Beleza, ${known.join(" ")}. ` : ""}Me diga ${missing.join(" e ")}. Pode responder curto, por exemplo: “corte” ou “amanhã”.`,
        intent: preservedIntent,
        state:"awaiting_booking_details",
        memory:nextMemory,
        source:"rule",
      };
    }

    if (confirmingBooking && selectedService && date && desiredTime) {
      const confirmedBarber = selectedBarber || previousBarber;
      return {
        reply:`Perfeito. Entendi sua confirmação: ${selectedService.name}${confirmedBarber ? ` com ${confirmedBarber.name}` : ""}, ${humanDate(date)} às ${desiredTime}. Para concluir o agendamento real com segurança, finalize aqui: ${bookingLink(context.organization.slug)}`,
        intent:preservedIntent,
        state:"test_confirmation",
        memory:mergeCaAtendeMemory(nextMemory, { barber:confirmedBarber?.name || "" }),
        source:"rule",
        dataSource:"agenda",
        confirmationRequested:true,
      };
    }

    try {
      let slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, selectedService.id, selectedBarber?.id ?? 0);
      if (changingProfessional && previousBarber) slots = slots.filter(slot => normalizeCaAtendeText(slot.barberName) !== normalizeCaAtendeText(previousBarber.name));
      if (!slots.length) {
        const barberText = selectedBarber ? ` com ${selectedBarber.name}` : "";
        return {
          reply:`${changingProfessional ? "Não encontrei outro profissional livre" : `Para ${selectedService.name}${barberText}, não encontrei horário livre`} ${humanDate(date)}. Me diga outro dia que eu consulto pra você.`,
          intent:preservedIntent,
          state:"awaiting_booking_details",
          memory:nextMemory,
          source:interpreted.source,
          dataSource:"agenda",
        };
      }

      if (desiredTime) {
        const exact = slots.filter(slot => slot.time === desiredTime);
        if (exact.length) {
          const professionals = [...new Set(exact.map(slot => slot.barberName))];
          const professionalText = selectedBarber
            ? `com ${selectedBarber.name}`
            : professionals.length === 1
              ? `com ${professionals[0]}`
              : `com ${professionals.join(" ou ")}`;
          return {
            reply:`Sim. ${selectedService.name} ${professionalText} está disponível ${humanDate(date)} às ${desiredTime}. Para garantir esse horário, confirme aqui: ${bookingLink(context.organization.slug)}`,
            intent:preservedIntent,
            state:"awaiting_booking_choice",
            memory:nextMemory,
            source:interpreted.source,
            dataSource:"agenda",
          };
        }
        return {
          reply:`Às ${desiredTime} não está livre para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}. Tenho ${slotSummary(slots)}. Qual desses fica melhor?`,
          intent:preservedIntent,
          state:"awaiting_booking_choice",
          memory:{ ...nextMemory, time:"" },
          source:interpreted.source,
          dataSource:"agenda",
        };
      }

      return {
        reply:`${changingProfessional ? "Claro. " : ""}Para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}, tenho ${slotSummary(slots)}. Qual horário você prefere?`,
        intent:preservedIntent,
        state:"awaiting_booking_choice",
        memory:changingProfessional ? { ...nextMemory, barber:"", time:"" } : nextMemory,
        source:changingProfessional ? "rule" : interpreted.source,
        dataSource:"agenda",
      };
    } catch {
      return {
        reply:`Não consegui consultar a agenda agora. Tenta me mandar o dia e o serviço novamente ou use ${bookingLink(context.organization.slug)}.`,
        intent:preservedIntent,
        state:"awaiting_booking_details",
        memory:nextMemory,
        source:interpreted.source,
        dataSource:"agenda",
      };
    }
  }

  return {
    reply:`Posso te ajudar com preço, horário, agendamento ou chamar uma pessoa da ${context.organization.name}. Me fala do seu jeito o que você precisa.`,
    intent:"unknown",
    state:"",
    memory:{},
    source:interpreted.source,
  };
}

export type CaAtendeTestState = {
  botState: string;
  memory: CaAtendeContextMemory;
  paused: boolean;
};

export type CaAtendeTestResult = {
  reply: string;
  intent: string;
  source: "rule" | "ai";
  dataSource: "agenda" | "services" | null;
  handoff: boolean;
  silent: boolean;
  silentReason: "commercial_offer" | "human_takeover" | null;
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
      state: previousState,
    };
  }

  const decision = await composeReply({
    organizationId: input.organizationId,
    messageRowId: 0,
    providerMessageId: "test",
    phone: "5500000000000",
    text: message,
    receivedAt: new Date().toISOString(),
  }, context, {
    botState: previousState.botState,
    botContextJson: JSON.stringify(previousState.memory ?? {}),
  });

  const testReply = decision.confirmationRequested
    ? `Perfeito. Eu entendi sua confirmação: ${decision.memory.service || "serviço"}${decision.memory.barber ? ` com ${decision.memory.barber}` : ""}, ${decision.memory.date ? humanDate(decision.memory.date) : "no dia escolhido"}${decision.memory.time ? ` às ${decision.memory.time}` : ""}. No modo teste eu não altero sua agenda, então nenhum horário real foi criado.`
    : decision.reply;

  return {
    reply: testReply,
    intent: decision.intent,
    source: decision.source,
    dataSource: decision.dataSource ?? null,
    handoff: Boolean(decision.handoff),
    silent: Boolean(decision.spam),
    silentReason: decision.spam ? "commercial_offer" : null,
    state: {
      botState: decision.state,
      memory: decision.memory,
      paused: Boolean(decision.handoff),
    },
  };
}

export async function processCaAtendeInbound(event: WhatsappInboundTextEvent) {
  const context = await runtimeContext(event.organizationId);
  if (!context) return { handled:false, reason:"organization_not_found" as const };
  if (!context.settings.enabled || !context.settings.botEnabled || !context.connected || context.settings.monthlyMessageLimit <= 0) {
    return { handled:false, reason:"bot_inactive" as const };
  }

  const conversation = await conversationState(event.organizationId, event.phone);
  if (isPaused(conversation)) return { handled:false, reason:"human_takeover" as const };

  const decision = await composeReply(event, context, conversation);
  const now = new Date().toISOString();

  if (decision.spam) {
    await updateConversation({
      organizationId:event.organizationId,
      phone:event.phone,
      intent:decision.intent,
      state:decision.state,
      memory:decision.memory,
      suspectedOfferAt:now,
    });
    return { handled:true, replied:false, reason:"suspected_offer" as const };
  }

  const queued = await queueWhatsappTextReply({
    organizationId:event.organizationId,
    phone:event.phone,
    text:decision.reply,
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
