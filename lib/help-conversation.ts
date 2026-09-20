import { HELP_MESSAGE_LIMIT, type HelpMessage } from "./help-guide";

export const HELP_CONTEXT_TTL_MS = 8 * 60 * 60 * 1000;
export const SAFE_ASSISTANT_CONTEXT_PREFIX = "[contexto seguro]";

export type HelpConversationMemory = {
  updatedAt: number;
  messages: HelpMessage[];
};

export function helpConversationKey(organizationId: number, teamMemberId: number) {
  return `ca-help-context:${organizationId}:${teamMemberId}`;
}

function safeMessage(value: unknown): HelpMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { role?: unknown; content?: unknown };
  if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return null;
  const content = item.content.trim().slice(0, HELP_MESSAGE_LIMIT);
  if (!content) return null;
  if (item.role === "assistant" && !content.startsWith(SAFE_ASSISTANT_CONTEXT_PREFIX)) return null;
  return { role: item.role, content };
}

export function parseHelpConversationMemory(raw: string | null, now = Date.now()): HelpConversationMemory {
  if (!raw) return { updatedAt: now, messages: [] };
  try {
    const parsed = JSON.parse(raw) as { updatedAt?: unknown; messages?: unknown };
    const updatedAt = Number(parsed.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt >= HELP_CONTEXT_TTL_MS || updatedAt > now + 60_000) {
      return { updatedAt: now, messages: [] };
    }
    const source = Array.isArray(parsed.messages) ? parsed.messages : [];
    return { updatedAt, messages: source.map(safeMessage).filter((message): message is HelpMessage => Boolean(message)).slice(-10) };
  } catch {
    return { updatedAt: now, messages: [] };
  }
}

export function appendHelpConversation(memory: HelpConversationMemory, message: HelpMessage, now = Date.now()): HelpConversationMemory {
  const safe = safeMessage(message);
  if (!safe) return { updatedAt: now, messages: memory.messages.slice(-10) };
  return { updatedAt: now, messages: [...memory.messages, safe].slice(-10) };
}
