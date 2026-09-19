import { getSessionAccess } from "../../../db/auth";
import { isOrganizationAccessExpired } from "../../../db/access";
import { closeTeamPaymentCycle, getTeamMoneyData, saveTeamPaymentDay } from "../../../db/team-money";

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou." }, { status: 402 });
    return Response.json({ data: await getTeamMoneyData(access) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a Minha Grana." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou." }, { status: 402 });
    const body = await request.json() as Record<string, unknown>;

    let closureId: number | undefined;
    if (body.action === "save-payment-day") {
      await saveTeamPaymentDay(access, Number(body.teamMemberId), Number(body.paymentDay));
    } else if (body.action === "close") {
      closureId = await closeTeamPaymentCycle(access, Number(body.teamMemberId));
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, closureId, data: await getTeamMoneyData(access) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir." }, { status: 400 });
  }
}
