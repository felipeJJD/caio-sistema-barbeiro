import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { whatsappConnections } from "../../../../db/schema";
import { processWhatsappQueue } from "../../../../db/whatsapp";
import { processEvolutionWhatsappQueue } from "../../../../db/whatsapp-evolution";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = String(process.env.WHATSAPP_JOB_SECRET ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  return expected.length >= 24 && authorization === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const evolution = await processEvolutionWhatsappQueue({ limit: 40 });
    const db = await getDb();
    const metaOrganizations = await db.select({ organizationId: whatsappConnections.organizationId })
      .from(whatsappConnections)
      .where(and(eq(whatsappConnections.provider, "meta_cloud"), eq(whatsappConnections.status, "connected")))
      .limit(50);

    let metaProcessed = 0;
    let metaSent = 0;
    let metaFailed = 0;
    for (const connection of metaOrganizations) {
      const result = await processWhatsappQueue({ organizationId: connection.organizationId, limit: 10 });
      metaProcessed += result.processed;
      metaSent += result.sent;
      metaFailed += result.failed;
    }

    return Response.json({
      ok: true,
      processed: evolution.processed + metaProcessed,
      sent: evolution.sent + metaSent,
      failed: evolution.failed + metaFailed,
      providers: {
        evolution,
        meta_cloud: { processed: metaProcessed, sent: metaSent, failed: metaFailed },
      },
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
