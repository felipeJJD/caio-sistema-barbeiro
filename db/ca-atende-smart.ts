import { and, desc, eq } from "drizzle-orm";
import {
  classifyCaAtendeByRule,
  normalizeCaAtendeText,
  type CaAtendeContextMemory,
} from "../lib/ca-atende";
import { interpretCaAtendeWithAi } from "../lib/ca-atende-model";
import { processCaAtendeInboundSafely } from "./ca-atende";
import { recordAiUsageSafely } from "./ai-usage";
import { getDb } from "./index";
import { notifyOwnersOfWhatsappHandoff } from "./notifications";
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

const ACTIVE_CONVERSATION_MS = 30 * 60 * 1000;

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

function activeConversation(lastBotReplyAt: string | null | undefined) {
  if (!lastBotReplyAt) return false;
  const timestamp = Date.parse(lastBotReplyAt);
  return Number.isFinite(timestamp) && timestamp >= Date.now() - ACTIVE_CONVERSATION_MS;
}

function explicitBarbershopRequest(value: string) {
  const text = normalizeCaAtendeText(value);
  return /\b(quero|preciso|posso|gostaria|so quero|queria)?\s*(falar|conversar|chamar)\b.{0,40}\b(barbearia|voces|alguem|pessoa|atendente|humano|dono|responsavel|proprietario)\b/.test(text)
    || /\b(falar com a barbearia|chama a barbearia|quero falar com voces|quero falar com alguem|atendimento humano)\b/.test(text);
}

function greetingText(organizationName: string, slug: string, custom: string) {
  const link = `https://cortouanotou.com.br/agendar/${encodeURIComponent(slug)}`;
  if (custom.trim()) {
    return custom
      .replaceAll("{barbearia}", organizationName)
      .replaceAll("{link}", link)
      .trim()
      .slice(0, 3500);
  }
  return `Olá! Seja bem-vindo à ${organizationName}.\nSe quiser agendar seu horário, acesse ${link}.\nSe preferir, pode falar comigo por aqui que eu te ajudo.`;
}

function handoffText(organizationName: string, custom: string) {
  if (custom.trim()) return custom.replaceAll("{barbearia}", organizationName).trim().slice(0, 3500);
  return `Beleza. Vou deixar a ${organizationName} continuar com você por aqui.`;
}

function clarificationText(organizationName: string) {
  return `Não entendi certinho. Você quer agendar, ver horários, saber preços ou falar com a ${organizationName}?`;
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
  await db.insert(whatsappConversations).values({
    organizationId: input.event.organizationId,
    phone: input.event.phone,
    botState: input.state ?? (input.handoff ? "human_takeover" : ""),
    lastBotReplyAt: now,
    humanRequestedAt: input.handoff ? now : null,
    automationPausedUntil: input.handoff ? null : undefined,
    pauseReason: input.handoff ? "human_takeover" : "",
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [whatsappConversations.organizationId, whatsappConversations.phone],
    set: {
      ...(input.state !== undefined ? { botState: input.state } : {}),
      lastBotReplyAt: now,
      ...(input.handoff ? {
        botState: "human_takeover",
        humanRequestedAt: now,
        automationPausedUntil: null,
        pauseReason: "human_takeover",
      } : {}),
      updatedAt: now,
    },
  });

  if (input.handoff) {
    await notifyOwnersOfWhatsappHandoff({
      organizationId: input.event.organizationId,
      messageId: input.event.messageRowId,
      phone: input.event.phone,
      preview: input.event.text,
    });
  }

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
  const [context, conversation] = await Promise.all([
    smartContext(event.organizationId),
    currentConversation(event.organizationId, event.phone),
  ]);
  if (!context?.enabled || paused(conversation)) return processCaAtendeInboundSafely(event);

  const rule = classifyCaAtendeByRule(event.text);
  const isActive = activeConversation(conversation?.lastBotReplyAt);

  // Saudação completa para uma conversa nova. Dentro de uma conversa realmente
  // recente, um novo "oi" recebe apenas uma resposta curta e não repete o link.
  if (rule.intent === "greeting") {
    const text = isActive
      ? "Oi! Pode falar, como posso te ajudar?"
      : greetingText(context.organization.name, context.organization.slug, context.greetingText);
    return queueSmartReply({ event, text, state: isActive ? conversation?.botState ?? "" : "menu", intent: "greeting" });
  }

  // Pedidos claros de atendimento humano encerram a automação naquele contato.
  if (rule.intent === "human" || explicitBarbershopRequest(event.text)) return queueHumanHandoff(event, context);

  // Agenda, preço, disponibilidade, cancelamento e remarcação reconhecidos por
  // regra seguem direto para o fluxo real. Não são tratados como dúvida humana.
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
    memory: safeMemory(conversation?.botContextJson),
    state: String(conversation?.botState ?? ""),
    recentMessages,
  });
  if (ai?.aiUsage) await recordAiUsageSafely({ organizationId: event.organizationId, surface: "ca_atende", usage: ai.aiUsage });

  if (ai?.intent === "greeting") {
    const text = isActive
      ? "Oi! Pode falar, como posso te ajudar?"
      : greetingText(context.organization.name, context.organization.slug, context.greetingText);
    return queueSmartReply({ event, text, state: isActive ? conversation?.botState ?? "" : "menu", intent: "greeting" });
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
