import { after } from "next/server";
import {
  handleEvolutionWebhook,
  processEvolutionWhatsappQueue,
  validEvolutionWebhookAuthorization,
} from "../../../../../db/evolution-whatsapp";
import { isEvolutionAudioWebhook, transcribeEvolutionAudioWebhook } from "../../../../../db/evolution-audio";
import { processCaAtendeSmartInboundSafely } from "../../../../../db/ca-atende-smart";
import { queueWhatsappTextReply } from "../../../../../db/whatsapp";
import { captureProspectingEvolutionInbound } from "../../../../../lib/affiliate-prospecting-inbound";

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

    // A instância de prospecção é isolada do C.A. Atende. Respostas recebidas
    // nela viram histórico do afiliado e nunca entram no bot da barbearia.
    const prospecting = await captureProspectingEvolutionInbound(payload).catch(() => {
      const error = new Error("Recebimento da prospecção temporariamente indisponível.");
      Object.assign(error, { status: 503 }); throw error;
    });
    if (prospecting.handled) {
      return Response.json({ ok:true, prospecting:true, recorded:prospecting.recorded, duplicate:prospecting.duplicate ?? false });
    }

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
          await processCaAtendeSmartInboundSafely(event);
          // A fila filtra o provedor antes do envio; apenas a Evolution pode
          // processar as respostas desta conexão.
          await processEvolutionWhatsappQueue({ organizationId:event.organizationId, limit:2 });
        }
      });
    }
    return Response.json({ ok:true, received:result.received, statuses:result.statuses });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "Webhook inválido." }, { status:Number((error as {status?:number})?.status) === 503 ? 503 : 400 });
  }
}
