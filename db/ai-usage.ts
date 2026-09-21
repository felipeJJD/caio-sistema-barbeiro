import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { AiUsageSnapshot } from "../lib/ai-usage";
import { getDb } from "./index";
import { aiUsageEvents } from "./schema";

export type AiUsageSurface = "ca_atende" | "help";

export async function recordAiUsageSafely(input: {
  organizationId: number;
  surface: AiUsageSurface;
  usage?: AiUsageSnapshot | null;
}) {
  const organizationId = Number(input.organizationId);
  const usage = input.usage;
  if (!Number.isInteger(organizationId) || organizationId <= 0 || !usage || usage.totalTokens <= 0) return;
  try {
    const db = await getDb();
    await db.insert(aiUsageEvents).values({
      organizationId,
      surface: input.surface,
      model: usage.model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });
  } catch (error) {
    // Metering must never break a client conversation.
    console.warn("ai_usage_metering_failed", { surface: input.surface, type: error instanceof Error ? error.name : "Unknown" });
  }
}

export async function aiUsageSummaryForOrganization(organizationId: number, startIso: string, endExclusiveIso: string) {
  const db = await getDb();
  const rows = await db.select({
    calls: sql<number>`count(*)`,
    inputTokens: sql<number>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)`,
    cachedInputTokens: sql<number>`coalesce(sum(${aiUsageEvents.cachedInputTokens}), 0)`,
    outputTokens: sql<number>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)`,
    totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)`,
  }).from(aiUsageEvents).where(and(
    eq(aiUsageEvents.organizationId, organizationId),
    gte(aiUsageEvents.createdAt, startIso),
    lt(aiUsageEvents.createdAt, endExclusiveIso),
  ));
  const row = rows[0];
  return {
    calls: Number(row?.calls ?? 0),
    inputTokens: Number(row?.inputTokens ?? 0),
    cachedInputTokens: Number(row?.cachedInputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0),
  };
}
