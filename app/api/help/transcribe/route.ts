import { getSessionAccess } from "../../../../db/auth";
import { isOrganizationAccessExpired } from "../../../../db/access";
import { enforceRateLimit, RateLimitError } from "../../../../db/rate-limit";

const json = (body: { text?: string; error?: string }, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
]);

export async function POST(request: Request) {
  const access = await getSessionAccess();
  if (!access) return json({ error: "Sua sessão terminou. Entre novamente." }, 401);
  if (isOrganizationAccessExpired(access)) return json({ error: "O plano da barbearia precisa estar ativo para usar áudio no assistente." }, 402);

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_AUDIO_BYTES + 200000) return json({ error: "Esse áudio ficou muito grande. Grave uma mensagem mais curta." }, 413);

    await enforceRateLimit({
      scope: "help-audio",
      identifier: access.organizationId + ":" + access.teamMemberId,
      limit: 12,
      windowMs: 60000,
      message: "Você enviou vários áudios seguidos. Aguarde um minuto e tente novamente.",
    });

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return json({ error: "Não encontrei o áudio enviado." }, 400);
    if (!audio.size) return json({ error: "O áudio está vazio. Grave novamente." }, 400);
    if (audio.size > MAX_AUDIO_BYTES) return json({ error: "Esse áudio ficou muito grande. Grave uma mensagem mais curta." }, 413);

    const type = (audio.type || "").toLowerCase();
    if (type && !ALLOWED_AUDIO_TYPES.has(type) && !type.startsWith("audio/webm;")) {
      return json({ error: "Formato de áudio não suportado neste navegador." }, 415);
    }

    const { env } = await import("@/runtime/env");
    const settings = env as unknown as { OPENAI_API_KEY?: string; OPENAI_TRANSCRIBE_MODEL?: string };
    const key = settings.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) return json({ error: "A transcrição por áudio ainda não está configurada." }, 503);

    const outbound = new FormData();
    const extension = type.includes("mp4") || type.includes("m4a") ? "m4a"
      : type.includes("mpeg") ? "mp3"
      : type.includes("wav") ? "wav"
      : "webm";
    outbound.append("file", audio, `assistente.${extension}`);
    outbound.append("model", settings.OPENAI_TRANSCRIBE_MODEL || process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    outbound.append("prompt", "Português brasileiro. Conversa com assistente de gestão de barbearia. Preserve nomes próprios, horários, valores em reais, serviços como corte e barba e palavras Cortou Anotou.");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: outbound,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const failure = await response.json() as { error?: { message?: string } };
        detail = failure.error?.message?.slice(0, 300) || "";
      } catch {}
      console.warn("help_audio_transcription_failed", { status: response.status, detail });
      if (response.status === 429) return json({ error: "O serviço de áudio está sem crédito disponível no momento." }, 503);
      return json({ error: "Não consegui entender este áudio agora. Tente novamente." }, 502);
    }

    const payload = await response.json() as { text?: string };
    const text = payload.text?.trim() || "";
    if (!text) return json({ error: "Não consegui identificar fala neste áudio." }, 422);
    return json({ text: text.slice(0, 4000) });
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message }, 429);
    console.error("help_audio_failed", { type: error instanceof Error ? error.name : "Unknown" });
    return json({ error: "Não consegui processar o áudio. Tente novamente." }, 503);
  }
}
