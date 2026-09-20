import type { AccessContext } from "./access";
import { normalizeHelp } from "../lib/help-guide";

type D1Value = string | number | null;
type Statement = {
  bind(...values: D1Value[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};
type Database = { prepare(sql: string): Statement };

export type AssistantProfile = {
  interactionCount: number;
  detailScore: number;
  warmthScore: number;
  humorScore: number;
  emojiScore: number;
  initiativeScore: number;
};

const DEFAULT_PROFILE: AssistantProfile = {
  interactionCount: 0,
  detailScore: 55,
  warmthScore: 75,
  humorScore: 25,
  emojiScore: 10,
  initiativeScore: 70,
};

function clamp(value: number) {
  return Math.max(5, Math.min(95, Math.round(value)));
}

async function database() {
  const { env } = await import("@/runtime/env");
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function readAssistantProfile(access: AccessContext): Promise<AssistantProfile> {
  try {
    const db = await database();
    const row = await db.prepare(`
      SELECT interaction_count AS interactionCount,
             detail_score AS detailScore,
             warmth_score AS warmthScore,
             humor_score AS humorScore,
             emoji_score AS emojiScore,
             initiative_score AS initiativeScore
      FROM assistant_profiles
      WHERE organization_id = ? AND team_member_id = ?
    `).bind(access.organizationId, access.teamMemberId).first<Record<string, number>>();
    if (!row) return DEFAULT_PROFILE;
    return {
      interactionCount: Number(row.interactionCount || 0),
      detailScore: clamp(Number(row.detailScore ?? DEFAULT_PROFILE.detailScore)),
      warmthScore: clamp(Number(row.warmthScore ?? DEFAULT_PROFILE.warmthScore)),
      humorScore: clamp(Number(row.humorScore ?? DEFAULT_PROFILE.humorScore)),
      emojiScore: clamp(Number(row.emojiScore ?? DEFAULT_PROFILE.emojiScore)),
      initiativeScore: clamp(Number(row.initiativeScore ?? DEFAULT_PROFILE.initiativeScore)),
    };
  } catch (error) {
    console.warn("assistant_profile_read_failed", { type: error instanceof Error ? error.name : "Unknown" });
    return DEFAULT_PROFILE;
  }
}

function signals(text: string) {
  const clean = normalizeHelp(text);
  let detail = 0, warmth = 0, humor = 0, emoji = 0, initiative = 0;

  if (text.length >= 110 || /\b(explica|detalha|detalhado|completo|me fala mais|quero entender|por que|porque)\b/.test(clean)) detail += 2;
  if (text.length <= 28 && !/[?!].*[?!]/.test(text)) detail -= 1;
  if (/\b(so o valor|so me fala|direto|direto ao ponto|resumido|resumo rapido|sem enrolar|bem curto)\b/.test(clean)) detail -= 8;
  if (/\b(mais detalhe|mais detalhes|explica melhor|quero completo|pode detalhar)\b/.test(clean)) detail += 8;

  if (/\b(opa|bom dia|boa tarde|boa noite|por favor|fazendo favor|obrigado|valeu|show|massa)\b/.test(clean)) warmth += 2;
  if (/\b(sem papo|nao precisa conversar|so responde|so a resposta)\b/.test(clean)) warmth -= 6;

  if (/(kkk+|haha+|rsrs+|😂|🤣|😅|😄|😁)/iu.test(text)) { humor += 5; emoji += 3; warmth += 1; }
  if (/\b(sem brincadeira|sem gracinha|serio|mais serio)\b/.test(clean)) humor -= 10;
  if (/\b(pode brincar|brincalhao|engracado|pode zoar|pode rir)\b/.test(clean)) humor += 12;

  if (/\b(sem emoji|sem emojis|nao use emoji|nao usa emoji)\b/.test(clean)) emoji -= 18;
  if (/\b(pode usar emoji|pode mandar emoji|gosto de emoji|com emoji)\b/.test(clean)) emoji += 15;

  if (/\b(o que voce acha|alguma ideia|pode sugerir|me sugere|o que mais|tem alguma sugestao)\b/.test(clean)) initiative += 5;
  if (/\b(nao sugira|sem sugestao|so responde|nao precisa perguntar)\b/.test(clean)) initiative -= 10;
  if (/^(e |e o |e a |e na |e no |so |e se )/.test(clean)) initiative += 1;

  return { detail, warmth, humor, emoji, initiative };
}

export async function learnAssistantProfile(access: AccessContext, text: string, current?: AssistantProfile): Promise<AssistantProfile> {
  const profile = current ?? await readAssistantProfile(access);
  const delta = signals(text);
  const next: AssistantProfile = {
    interactionCount: profile.interactionCount + 1,
    detailScore: clamp(profile.detailScore + delta.detail),
    warmthScore: clamp(profile.warmthScore + delta.warmth),
    humorScore: clamp(profile.humorScore + delta.humor),
    emojiScore: clamp(profile.emojiScore + delta.emoji),
    initiativeScore: clamp(profile.initiativeScore + delta.initiative),
  };
  try {
    const db = await database();
    await db.prepare(`
      INSERT INTO assistant_profiles (
        organization_id, team_member_id, interaction_count, detail_score, warmth_score,
        humor_score, emoji_score, initiative_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(organization_id, team_member_id) DO UPDATE SET
        interaction_count = excluded.interaction_count,
        detail_score = excluded.detail_score,
        warmth_score = excluded.warmth_score,
        humor_score = excluded.humor_score,
        emoji_score = excluded.emoji_score,
        initiative_score = excluded.initiative_score,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      access.organizationId,
      access.teamMemberId,
      next.interactionCount,
      next.detailScore,
      next.warmthScore,
      next.humorScore,
      next.emojiScore,
      next.initiativeScore,
    ).run();
  } catch (error) {
    console.warn("assistant_profile_learn_failed", { type: error instanceof Error ? error.name : "Unknown" });
  }
  return next;
}

export function assistantStyleInstruction(profile: AssistantProfile) {
  const detail = profile.detailScore >= 68
    ? "A pessoa costuma gostar de explicações um pouco mais completas, mas sem enrolação."
    : profile.detailScore <= 38
      ? "A pessoa prefere respostas curtas e diretas."
      : "Use respostas objetivas, com contexto suficiente.";
  const warmth = profile.warmthScore >= 60
    ? "Fale como um amigão profissional: gentil, natural, interessado e respeitoso."
    : "Mantenha tom profissional e cordial, sem puxar conversa demais.";
  const humor = profile.humorScore >= 58
    ? "Humor leve e uma brincadeira curta podem aparecer quando combinarem com a conversa."
    : "Não force piadas.";
  const emoji = profile.emojiScore >= 58
    ? "Pode usar no máximo um emoji ocasional quando combinar com o jeito da pessoa."
    : "Evite emojis, a menos que a pessoa esteja usando bastante.";
  const initiative = profile.initiativeScore >= 58
    ? "Depois de responder, faça no máximo UMA sugestão realmente útil baseada no contexto ou nos dados. Não use frases genéricas como 'posso ajudar em algo mais?'."
    : "Responda ao pedido e só sugira um próximo passo quando for claramente necessário.";
  return [detail, warmth, humor, emoji, initiative].join(" ");
}
