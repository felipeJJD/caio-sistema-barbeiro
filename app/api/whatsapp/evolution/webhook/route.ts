import { after } from "next/server";
import {
  handleEvolutionWebhook,
  processEvolutionWhatsappQueue,
  validEvolutionWebhookAuthorization,
} from "../../../../../db/evolution-whatsapp";
import { processCaAtendeInboundSafely } from "../../../../../db/ca-atende";

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
    if (result.inboundTextEvents.length) {
      after(async () => {
        for (const event of result.inboundTextEvents) {
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
