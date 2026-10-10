import { processEvolutionWhatsappQueue } from "./evolution-whatsapp";
import { processWhatsappQueueSafely } from "./whatsapp";

export async function processConnectedWhatsappQueueSafely(organizationId: number, appointmentId: number, limit = 5) {
  if (!Number.isSafeInteger(organizationId) || organizationId < 1 || !Number.isSafeInteger(appointmentId) || appointmentId < 1) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  const meta = await processWhatsappQueueSafely(organizationId, limit, appointmentId);
  let evolution = { processed:0, sent:0, failed:0 };
  try {
    evolution = await processEvolutionWhatsappQueue({ organizationId, appointmentId, limit });
  } catch (error) {
    console.error("Evolution WhatsApp automation send failed", { type:error instanceof Error ? error.name : "Unknown" });
  }
  return {
    processed: meta.processed + evolution.processed,
    sent: meta.sent + evolution.sent,
    failed: meta.failed + evolution.failed,
    providers: { meta, evolution },
  };
}
