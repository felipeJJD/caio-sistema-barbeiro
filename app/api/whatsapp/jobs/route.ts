import { processEvolutionWhatsappQueue } from "../../../../db/evolution-whatsapp";
import { processWhatsappQueue } from "../../../../db/whatsapp";
import { processWhatsappStatusQueue } from "../../../../db/whatsapp-status";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = String(process.env.WHATSAPP_JOB_SECRET ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  return expected.length >= 24 && authorization === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    // Cada fila é isolada por provedor/tipo para um erro não consumir o limite da outra.
    const meta = await processWhatsappQueue({ limit: 40 });
    const evolution = await processEvolutionWhatsappQueue({ limit: 40 });
    const statusPublications = await processWhatsappStatusQueue({ limit: 20 });
    return Response.json({
      ok: true,
      processed: meta.processed + evolution.processed + statusPublications.processed,
      sent: meta.sent + evolution.sent + statusPublications.sent,
      failed: meta.failed + evolution.failed + statusPublications.failed,
      providers: { meta, evolution, statusPublications },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível processar a fila." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
