import { requirePlatformAdmin } from "../../../../db/access";
import { getSessionAccess } from "../../../../db/auth";
import { getPlatformTrialDays, savePlatformTrialDays } from "../../../../db/platform-trial";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    requirePlatformAdmin(access);
    return noStore({ trialDays: await getPlatformTrialDays() });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível consultar os dias de teste." }, 403);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    const data = await request.json() as { trialDays?: number };
    const trialDays = await savePlatformTrialDays(access, data.trialDays);
    return noStore({ ok: true, trialDays });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível salvar os dias de teste." }, 400);
  }
}
