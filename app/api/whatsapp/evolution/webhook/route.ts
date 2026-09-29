import { after } from "next/server";
import {
  handleEvolutionWebhook,
  processEvolutionWhatsappQueue,
  validEvolutionWebhookAuthorization,
} from "../../../../../db/evolution-whatsapp";
import { isEvolutionAudioWebhook, transcribeEvolutionAudioWebhook } from "../../../../../db/evolution-audio";
import { processCaAtendeInboundSafely } from "../../../../../db/ca-atende";
import { queueWhatsappTextReply } from "../../../../../db/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!validEvolutionWebhookAuthorization(authorization)) {
      return Response.json({ error:"Não autorizado." }, { status:401 });
    }
    const raw = await request.text();
    if (raw.length > 1_000_000) return Response.json({ error:"Payload muito grande." }, { status:413 });
    const payload = JSON.parse(raw) as unknown;
    const result = await handleEvolutionWebhook(payload);
    const hasAudio = isEvolutionAudioWebhook(payload);

    if (result.inboundTextEvents.length || hasAudio) {
      after(async () => {
        const events = [...result.inboundTextEvents];
        if (hasAudio && !events.length) {
          const transcribed = await transcribeEvolutionAudioWebhook(payload);
          if (transcribed) {
            events.push(transcribed);
          } else {
            const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
            const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data as Record<string, unknown> : {};
            const key = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
            const remoteJid = String(key.remoteJidAlt ?? key.remoteJid ?? data.remoteJidAlt ?? data.remoteJid ?? "");
            const phone = remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
            const providerMessageId = String(key.id ?? data.id ?? "").trim();
            const organizationId = Number(String(body.instance ?? body.instanceName ?? "").replace(/^ca-org-/, ""));
            if (phone && providerMessageId && Number.isInteger(organizationId) && organizationId > 0) {
              await queueWhatsappTextReply({
                organizationId,
                phone,
                inboundProviderMessageId:providerMessageId,
                text:"Não consegui entender esse áudio. Pode mandar de novo ou escrever a mensagem pra mim?",
              });
              await processEvolutionWhatsappQueue({ organizationId, limit:2 });
            }
          }
        }

        for (const event of events) {
          await processCaAtendeInboundSafely(event);
          // A fila filtra o provedor antes do envio; apenas a Evolution pode
          // processar as respostas desta conexão.
          await processEvolutionWhatsappQueue({ organizationId:event.organizationId, limit:2 });
        }
      });
    }
    return Response.json({ ok:true, received:result.received, statuses:result.statuses });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "Webhook inválido." }, { status:400 });
  }
}
