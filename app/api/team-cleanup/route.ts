import { isOrganizationAccessExpired } from "../../../db/access";
import { getSessionAccess } from "../../../db/auth";
import {
  deletePendingTeamRegistration,
  deleteSuspendedTeamUser,
  deleteUnusedTeamInvite,
  listTeamCleanupCandidates,
} from "../../../db/team-cleanup";

async function requireAccess() {
  const access = await getSessionAccess();
  if (!access) return { response: Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 }) };
  if (isOrganizationAccessExpired(access)) return { response: Response.json({ error: "Renove o plano para gerenciar os usuários." }, { status: 402 }) };
  if (!access.isOwner) return { response: Response.json({ error: "Somente o administrador pode gerenciar usuários." }, { status: 403 }) };
  return { access };
}

export async function GET() {
  try {
    const auth = await requireAccess();
    if ("response" in auth) return auth.response;
    return Response.json(await listTeamCleanupCandidates(auth.access), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a lixeira da equipe." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAccess();
    if ("response" in auth) return auth.response;
    const body = await request.json() as { action?: string; teamMemberId?: number; inviteId?: number; pendingId?: number };

    if (body.action === "delete-user") {
      await deleteSuspendedTeamUser(auth.access, Number(body.teamMemberId));
    } else if (body.action === "delete-invite") {
      await deleteUnusedTeamInvite(auth.access, Number(body.inviteId));
    } else if (body.action === "delete-pending") {
      await deletePendingTeamRegistration(auth.access, Number(body.pendingId));
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, ...(await listTeamCleanupCandidates(auth.access)) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a exclusão." }, { status: 400 });
  }
}
