import { processWhatsappQueue } from "../../../../db/whatsapp";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = String(process.env.WHATSAPP_JOB_SECRET ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  return expected.length >= 24 && authorization === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await processWhatsappQueue({ limit: 40 })) });
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
