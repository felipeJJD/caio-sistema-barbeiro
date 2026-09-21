export type AiUsageSnapshot = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function safeTokenCount(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function parseAiUsage(payload: unknown, model: string): AiUsageSnapshot {
  const value = payload as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  const inputTokens = safeTokenCount(value?.usage?.input_tokens);
  const outputTokens = safeTokenCount(value?.usage?.output_tokens);
  const cachedInputTokens = Math.min(inputTokens, safeTokenCount(value?.usage?.input_tokens_details?.cached_tokens));
  const totalTokens = safeTokenCount(value?.usage?.total_tokens) || inputTokens + outputTokens;
  return {
    model: String(model || "unknown").slice(0,120),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
  };
}
