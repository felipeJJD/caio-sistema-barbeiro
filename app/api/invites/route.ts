import { createTeamInvite, getSessionAccess, listTeamInvites, listTeamUsers, revokeTeamInvite, setTeamUserActive } from "../../../db/auth";
import { isOrganizationAccessExpired } from "../../../db/access";

async function accessData(access: NonNullable<Awaited<ReturnType<typeof getSessionAccess>>>) {
  return { invites: await listTeamInvites(access), users: await listTeamUsers(access) };
}

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "Renove o plano para gerenciar os usuários." }, { status: 402 });
    if (!access.isOwner) return Response.json({ error: "Somente o administrador pode gerenciar usuários." }, { status: 403 });
    return Response.json(await accessData(access));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os usuários." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "Renove o plano para gerenciar os usuários." }, { status: 402 });
    if (!access.isOwner) return Response.json({ error: "Somente o administrador pode gerenciar usuários." }, { status: 403 });
    const data = await request.json() as Record<string, string | number | boolean | undefined>;
    let inviteUrl: string | undefined;

    if (data.action === "create") {
      const invite = await createTeamInvite(access, {
        teamMemberId: Number(data.teamMemberId ?? 0),
        invitedName: String(data.invitedName ?? ""),
        role: String(data.role ?? "Barbeiro"),
        accessRole: String(data.accessRole ?? "barber"),
        commissionRateBps: Number(data.commissionRateBps ?? 5000),
      });
      inviteUrl = new URL(`/convite/${invite.inviteToken}`, "https://cortouanotou.com.br").toString();
    } else if (data.action === "revoke") {
      await revokeTeamInvite(access, Number(data.inviteId));
    } else if (data.action === "toggle-user") {
      await setTeamUserActive(access, Number(data.teamMemberId), Boolean(data.active));
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, ...(await accessData(access)), inviteUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a ação." }, { status: 400 });
  }
}
