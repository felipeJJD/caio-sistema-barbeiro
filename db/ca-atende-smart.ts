import { and, desc, eq } from "drizzle-orm";
import {
  classifyCaAtendeByRule,
  normalizeCaAtendeText,
  type CaAtendeContextMemory,
} from "../lib/ca-atende";
import { interpretCaAtendeWithAi } from "../lib/ca-atende-model";
import { processCaAtendeInboundSafely } from "./ca-atende";
import { getCaAtendeFlowState, startCaAtendeFlow } from "./ca-atende-flow";
import { recordAiUsageSafely } from "./ai-usage";
import { getDb } from "./index";
import {
  organizations,
  services,
  team,
  whatsappAutomationSettings,
  whatsappConnections,
  whatsappConversations,
  whatsappMessages,
} from "./schema";
import { getWhatsappEntitlementForOrganization } from "./whatsapp-entitlement";
import {
  processWhatsappQueueSafely,
  queueWhatsappTextReply,
  type WhatsappInboundTextEvent,
} from "./whatsapp";

type RecentMessage = {
  role: "cliente" | "barbearia";
  text: string;
};

function safeMemory(value: string | null | undefined): CaAtendeContextMemory {
  try {
    const parsed = JSON.parse(value || "{}") as CaAtendeContextMemory;
    return {
      intent: String(parsed.intent || "").slice(0, 40),
      date: String(parsed.date || "").slice(0, 10),
      time: String(parsed.time || "").slice(0, 5),
      service: String(parsed.service || "").slice(0, 120),
      barber: String(parsed.barber || "").slice(0, 120),
      clientName: String(parsed.clientName || "").slice(0, 120),
      paymentChoice: String(parsed.paymentChoice || "").slice(0, 30),
      appointmentId: Math.max(0, Math.round(Number(parsed.appointmentId || 0))),
      manageAction: parsed.manageAction === "cancel" || parsed.manageAction === "reschedule" ? parsed.manageAction : "",
      lastChoices: Array.isArray(parsed.lastChoices)
        ? parsed.lastChoices.map((item) => String(item || "").trim().slice(0, 180)).filter(Boolean).slice(0, 10)
        : [],
      afterTime: String(parsed.afterTime || "").slice(0, 5),
      beforeTime: String(parsed.beforeTime || "").slice(0, 5),
    };
  } catch {
    return {};
  }
}

function payloadText(kind: string, payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson || "{}") as Record<string, unknown>;
    if (kind === "bot_text") return String(payload.text ?? "").trim();
    const directText = payload.text;
    if (directText && typeof directText === "object") {
      const body = directText as Record<string, unknown>;
      const text = String(body.body ?? "").trim();
      if (text) return text;
    }
    const message = payload.message;
    if (message && typeof message === "object") {
      const body = message as Record<string, unknown>;
      const conversation = String(body.conversation ?? "").trim();
      if (conversation) return conversation;
      const extended = body.extendedTextMessage;
      if (extended && typeof extended === "object") {
        const text = String((extended as Record<string, unknown>).text ?? "").trim();
        if (text) return text;
      }
      const buttons = body.buttonsResponseMessage;
      if (buttons && typeof buttons === "object") {
        const text = String((buttons as Record<string, unknown>).selectedDisplayText ?? "").trim();
        if (text) return text;
      }
      const list = body.listResponseMessage;
      if (list && typeof list === "object") {
        const listBody = list as Record<string, unknown>;
        const title = String(listBody.title ?? "").trim();
        if (title) return title;
        const single = listBody.singleSelectReply;
        if (single && typeof single === "object") {
          const selected = String((single as Record<string, unknown>).selectedRowId ?? "").trim();
          if (selected) return selected;
        }
      }
    }
  } catch {
    return "";
  }
  return "";
}

async function recentConversation(organizationId: number, phone: string, currentProviderMessageId: string): Promise<RecentMessage[]> {
  const db = await getDb();
  const rows = await db.select({
    id: whatsappMessages.id,
    direction: whatsappMessages.direction,
    kind: whatsappMessages.kind,
    payloadJson: whatsappMessages.payloadJson,
    providerMessageId: whatsappMessages.providerMessageId,
  }).from(whatsappMessages).where(and(
    eq(whatsappMessages.organizationId, organizationId),
    eq(whatsappMessages.phone, phone),
  )).orderBy(desc(whatsappMessages.id)).limit(12);

  return rows
    .filter((row) => row.providerMessageId !== currentProviderMessageId)
    .map((row) => ({
      id: row.id,
      role: row.direction === "inbound" ? "cliente" as const : "barbearia" as const,
      text: payloadText(row.kind, row.payloadJson).replace(/\s+/g, " ").trim().slice(0, 420),
    }))
    .filter((row) => row.text)
    .slice(0, 8)
    .reverse()
    .map(({ role, text }) => ({ role, text }));
}

function explicitBarbershopRequest(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(atendimento humano|falar com a barbearia|falar com alguem|quero uma pessoa|quero atendente)\b/.test(text)
    || /\b(falar|conversar)\s+com\s+\S+/.test(text)
    || /\b(quero|queria|preciso|gostaria|posso|tem como|da pra|consegue)\b.{0,30}\b(falar|conversar)\s+com\b/.test(text)
    || /\b(chama|chamar|chame|me passa|passa|transfere|transferir)\b.{0,35}\b(alguem|pessoa|barbeiro|barbeira|dono|responsavel|proprietario|atendente)\b/.test(text)
    || /\b(me passa|passa|transfere)\b.{0,18}\b(pro|pra|para o|para a)\b.{0,24}\S+/.test(text);
}

function wantsAutomatedEntryChoice(value: string) {
  const text = normalizeCaAtendeText(value);
  return /^(1|opcao 1|primeira opcao)$/.test(text)
    || /\b(continuar|seguir|resolver|fazer|atender|ajuda|ajudar)\b.{0,24}\bpor aqui\b/.test(text)
    || /\b(pode ser|vamos|bora)\s+por aqui\b/.test(text)
    || /\bpor aqui mesmo\b/.test(text);
}

function wantsHumanEntryChoice(value: string) {
  const text = normalizeCaAtendeText(value);
  return /^(2|opcao 2|segunda opcao)$/.test(text) || explicitBarbershopRequest(value);
}

function greetingText(organizationName: string, slug: string, custom: string) {
  const link = `https://cortouanotou.com.br/agendar/${encodeURIComponent(slug)}`;
  const intro = custom.trim()
    ? custom
      .replaceAll("{barbearia}", organizationName)
      .replaceAll("{link}", link)
      .trim()
    : `Olá! Tudo bem? Somos da ${organizationName}.`;
  const normalizedIntro = normalizeCaAtendeText(intro);
  const blocks = [intro];
  if (!intro.includes(link)) blocks.push(`Para agendar seu horário, use nosso link:\n${link}`);
  const hasBothChoices = /\bcontinuar por aqui\b/.test(normalizedIntro) && /\bfalar com (alguem|a barbearia)\b/.test(normalizedIntro);
  if (!hasBothChoices) {
    blocks.push("Se preferir, posso te ajudar por aqui.\n\n*Digite somente o número da opção desejada.*\n1️⃣ Continuar por aqui\n2️⃣ Falar com alguém da barbearia");
  }
  return blocks.join("\n\n").slice(0, 3500);
}

function entryChoiceText(organizationName: string) {
  return `Pode escolher como prefere continuar:\n\n*Digite somente o número da opção desejada.*\n1️⃣ Continuar por aqui\n2️⃣ Falar com alguém da ${organizationName}`;
}

function handoffText(organizationName: string, custom: string) {
  if (custom.trim()) return custom.replaceAll("{barbearia}", organizationName).trim().slice(0, 3500);
  return `Beleza. Vou chamar alguém da ${organizationName}. Aguarde um pouquinho que a barbearia continua com você por aqui.`;
}

function clarificationText(organizationName: string) {
  return `Não entendi certinho.\n\n*Digite somente o número da opção desejada.*\n1️⃣ Agendar horário\n2️⃣ Ver horários disponíveis\n3️⃣ Preços e serviços\n4️⃣ Falar com alguém da ${organizationName}`;
}

function clarificationChoice(value: string) {
  const text = normalizeCaAtendeText(value);
  if (/^(1|opcao 1|primeira opcao)$/.test(text)) return "booking" as const;
  if (/^(2|opcao 2|segunda opcao)$/.test(text)) return "availability" as const;
  if (/^(3|opcao 3|terceira opcao)$/.test(text)) return "prices" as const;
  if (/^(4|opcao 4|quarta opcao)$/.test(text)) return "human" as const;
  return "" as const;
}

function hasStageNumberedChoice(value: string, memory: CaAtendeContextMemory) {
  const choices = Array.isArray(memory.lastChoices) ? memory.lastChoices : [];
  if (!choices.length) return false;
  const text = normalizeCaAtendeText(value);
  const match = /^(?:opcao\s*)?(\d{1,2})$/.exec(text);
  if (!match) return false;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < choices.length;
}

async function smartContext(organizationId: number) {
  const db = await getDb();
  const [organization, settings, connection, serviceList, barberList, entitlement] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db.select().from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, organizationId)).limit(1),
    db.select({ status: whatsappConnections.status }).from(whatsappConnections).where(eq(whatsappConnections.organizationId, organizationId)).limit(1),
    db.select({ name: services.name }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.active, true))),
    db.select({ name: team.name }).from(team).where(and(eq(team.organizationId, organizationId), eq(team.active, true))),
    getWhatsappEntitlementForOrganization(organizationId),
  ]);
  if (!organization[0]) return null;
  const current = settings[0];
  return {
    organization: organization[0],
    services: serviceList.map((item) => item.name),
    barbers: barberList.map((item) => item.name),
    enabled: Boolean(current?.enabled) && Boolean(current?.botEnabled) && connection[0]?.status === "connected" && entitlement.hasAccess,
    aiEnabled: current?.aiFallbackEnabled === undefined ? true : Boolean(current.aiFallbackEnabled),
    greetingText: String(current?.greetingText ?? ""),
    handoffText: String(current?.handoffText ?? ""),
  };
}

async function currentConversation(organizationId: number, phone: string) {
  const db = await getDb();
  return (await db.select().from(whatsappConversations).where(and(
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.phone, phone),
  )).limit(1))[0] ?? null;
}

function paused(conversation: Awaited<ReturnType<typeof currentConversation>>) {
  if (!conversation) return false;
  if (conversation.pauseReason === "human_takeover" && !conversation.automationPausedUntil) return true;
  return Boolean(conversation.automationPausedUntil && conversation.automationPausedUntil > new Date().toISOString());
}

async function queueSmartReply(input: {
  event: WhatsappInboundTextEvent;
  text: string;
  handoff?: boolean;
  state?: string;
  intent?: string;
  resetConversation?: boolean;
  startFlow?: boolean;
}) {
  const queued = await queueWhatsappTextReply({
    organizationId: input.event.organizationId,
    phone: input.event.phone,
    text: input.text,
    inboundProviderMessageId: input.event.providerMessageId,
  });
  if (!queued.queued) return { handled: false, reason: queued.reason };

  const db = await getDb();
  const now = new Date().toISOString();
  if (input.startFlow) {
    try {
      await startCaAtendeFlow(input.event.organizationId, input.event.phone, new Date(now));
    } catch (error) {
      console.error("ca_atende_flow_start_failed", { type: error instanceof Error ? error.name : "Unknown" });
    }
  }
  await db.insert(whatsappConversations).values({
    organizationId: input.event.organizationId,
    phone: input.event.phone,
    botState: input.state ?? (input.handoff ? "human_takeover" : ""),
    botContextJson: input.resetConversation ? "{}" : undefined,
    lastIntent: input.resetConversation ? "greeting" : undefined,
    lastBotReplyAt: now,
    humanRequestedAt: input.handoff ? now : null,
    unresolvedTurns: input.resetConversation ? 0 : undefined,
    automationPausedUntil: input.handoff ? null : undefined,
    pauseReason: input.handoff ? "human_takeover" : "",
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [whatsappConversations.organizationId, whatsappConversations.phone],
    set: {
      ...(input.state !== undefined ? { botState: input.state } : {}),
      lastBotReplyAt: now,
      ...(input.resetConversation ? {
        botContextJson: "{}",
        lastIntent: "greeting",
        unresolvedTurns: 0,
        humanRequestedAt: null,
        automationPausedUntil: null,
        pauseReason: "",
      } : {}),
      ...(input.handoff ? {
        botState: "human_takeover",
        humanRequestedAt: now,
        automationPausedUntil: null,
        pauseReason: "human_takeover",
      } : {}),
      updatedAt: now,
    },
  });

  // O handoff continua pausando o C.A. Atende e transferindo a conversa,
  // mas não gera notificação interna/push para o proprietário.

  // Para conexões Meta esta chamada envia a resposta. Em Evolution ela não
  // consome a fila; o endpoint Evolution processa a fila logo após o retorno.
  await processWhatsappQueueSafely(input.event.organizationId, 1);
  return { handled: true, replied: true, handoff: Boolean(input.handoff), intent: input.intent ?? (input.handoff ? "human" : "greeting") };
}

function queueHumanHandoff(event: WhatsappInboundTextEvent, context: NonNullable<Awaited<ReturnType<typeof smartContext>>>) {
  return queueSmartReply({
    event,
    text: handoffText(context.organization.name, context.handoffText),
    handoff: true,
    intent: "human",
  });
}

function queueClarification(event: WhatsappInboundTextEvent, context: NonNullable<Awaited<ReturnType<typeof smartContext>>>, conversation: Awaited<ReturnType<typeof currentConversation>>) {
  if (conversation?.botState === "smart_clarify") return queueHumanHandoff(event, context);
  return queueSmartReply({
    event,
    text: clarificationText(context.organization.name),
    state: "smart_clarify",
    intent: "unknown",
  });
}

export async function processCaAtendeSmartInbound(event: WhatsappInboundTextEvent) {
  const [context, conversation, flow] = await Promise.all([
    smartContext(event.organizationId),
    currentConversation(event.organizationId, event.phone),
    getCaAtendeFlowState(event.organizationId, event.phone),
  ]);
  if (!context?.enabled || paused(conversation)) return processCaAtendeInboundSafely(event);

  // A tag interna "iniciou o fluxo" dura cinco dias a partir da abertura.
  // Enquanto estiver ativa, nenhuma mensagem repete a saudação completa ou o link.
  // Depois de expirar, a próxima mensagem inicia um ciclo novo e renova a tag.
  if (!flow.active) {
    return queueSmartReply({
      event,
      text: greetingText(context.organization.name, context.organization.slug, context.greetingText),
      state: "entry_choice",
      intent: "greeting",
      resetConversation: true,
      startFlow: true,
    });
  }

  // A escolha 1/2 só vale na porta de entrada. Números usados depois para
  // serviços, horários ou profissionais continuam pertencendo ao fluxo atual.
  if (conversation?.botState === "entry_choice") {
    if (wantsHumanEntryChoice(event.text)) return queueHumanHandoff(event, context);
    if (wantsAutomatedEntryChoice(event.text)) {
      return processCaAtendeInboundSafely({ ...event, text: "Ver opções" });
    }
  }

  // A lista de esclarecimento também tem números próprios. Eles só valem enquanto
  // o C.A. está exatamente nessa etapa e nunca interferem nos números de agenda.
  if (conversation?.botState === "smart_clarify") {
    const choice = clarificationChoice(event.text);
    if (choice === "human") return queueHumanHandoff(event, context);
    if (choice === "booking") return processCaAtendeInboundSafely({ ...event, text: "Agendar horário" });
    if (choice === "availability") return processCaAtendeInboundSafely({ ...event, text: "Ver horários disponíveis" });
    if (choice === "prices") return processCaAtendeInboundSafely({ ...event, text: "Preços e serviços" });
  }

  const memory = safeMemory(conversation?.botContextJson);
  // Uma resposta numérica de uma lista já exibida pertence ao motor determinístico
  // daquela etapa. Ela não passa pela IA, evitando que "2" mude de significado.
  if (hasStageNumberedChoice(event.text, memory)) return processCaAtendeInboundSafely(event);

  const rule = classifyCaAtendeByRule(event.text);

  // Durante os cinco dias do fluxo, um novo cumprimento nunca repete a abertura.
  if (rule.intent === "greeting") {
    const text = conversation?.botState === "entry_choice"
      ? entryChoiceText(context.organization.name)
      : "Oi! Pode falar, como posso te ajudar?";
    return queueSmartReply({ event, text, state: conversation?.botState ?? "", intent: "greeting" });
  }

  // Pedido para falar/conversar com alguém é semântico: pode citar dono,
  // funcionário, nome ou apelido. Escolher profissional para um serviço não cai aqui.
  if (rule.intent === "human" || explicitBarbershopRequest(event.text)) return queueHumanHandoff(event, context);

  // Agenda, preço, disponibilidade, cancelamento e remarcação reconhecidos por
  // regra seguem direto para o fluxo real depois da porta de entrada.
  if (rule.intent !== "unknown") return processCaAtendeInboundSafely(event);

  // Se a interpretação estiver indisponível, fazemos uma única pergunta curta.
  // Só depois de uma segunda mensagem ainda incompreensível ocorre handoff.
  if (!context.aiEnabled) return queueClarification(event, context, conversation);

  const recentMessages = await recentConversation(event.organizationId, event.phone, event.providerMessageId);
  const ai = await interpretCaAtendeWithAi({
    message: event.text,
    organizationName: context.organization.name,
    services: context.services,
    barbers: context.barbers,
    memory,
    state: String(conversation?.botState ?? ""),
    recentMessages,
  });
  if (ai?.aiUsage) await recordAiUsageSafely({ organizationId: event.organizationId, surface: "ca_atende", usage: ai.aiUsage });

  if (ai?.intent === "greeting") {
    const text = conversation?.botState === "entry_choice"
      ? entryChoiceText(context.organization.name)
      : "Oi! Pode falar, como posso te ajudar?";
    return queueSmartReply({ event, text, state: conversation?.botState ?? "", intent: "greeting" });
  }

  if (ai?.intent === "human") return queueHumanHandoff(event, context);

  // Falha ou unknown não gera notificação humana de primeira. A pessoa recebe
  // uma pergunta objetiva; se ainda assim continuar incompreensível, transferimos.
  if (!ai || ai.intent === "unknown") return queueClarification(event, context, conversation);

  return processCaAtendeInboundSafely(event);
}

export async function processCaAtendeSmartInboundSafely(event: WhatsappInboundTextEvent) {
  try {
    return await processCaAtendeSmartInbound(event);
  } catch (error) {
    console.error("ca_atende_smart_inbound_failed", { type: error instanceof Error ? error.name : "Unknown" });
    return processCaAtendeInboundSafely(event);
  }
}
