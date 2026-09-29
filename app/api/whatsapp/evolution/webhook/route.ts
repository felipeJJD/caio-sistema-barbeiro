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
    // The webhook handler inserts each inbound message once. A duplicate or an
    // unrecognized instance must never trigger another transcription or reply.
    const hasAudio = result.received > 0 && isEvolutionAudioWebhook(payload);

    if (result.inboundTextEvents.length || hasAudio) {
      after(async () => {
        const events = [...result.inboundTextEvents];
        if (hasAudio && !events.length) {
          const audio = await transcribeEvolutionAudioWebhook(payload);
          if (audio.kind === "transcribed") {
            events.push(audio.event);
          } else if (audio.kind === "failed") {
            const queued = await queueWhatsappTextReply({
              organizationId:audio.organizationId,
              phone:audio.phone,
              inboundProviderMessageId:audio.providerMessageId,
              text:"Não consegui entender esse áudio. Pode mandar de novo ou escrever a mensagem pra mim?",
            });
            if (queued.queued) await processEvolutionWhatsappQueue({ organizationId:audio.organizationId, limit:2 });
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
