import { processWhatsappQueue } from "../../../../db/whatsapp";
import { processEvolutionWhatsappQueue } from "../../../../db/evolution-whatsapp";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = String(process.env.WHATSAPP_JOB_SECRET ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  return expected.length >= 24 && authorization === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    // Mantemos a Cloud API intacta. Conexões Evolution que passaram pelo
    // processador legado são recuperadas em seguida sem reenviar falhas reais.
    const meta = await processWhatsappQueue({ limit: 40 });
    const evolution = await processEvolutionWhatsappQueue({ limit: 40 });
    return Response.json({
      ok: true,
      processed: meta.processed + evolution.processed,
      sent: meta.sent + evolution.sent,
      failed: meta.failed + evolution.failed,
      providers: { meta, evolution },
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
