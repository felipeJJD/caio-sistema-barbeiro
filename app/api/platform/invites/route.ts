import {
  deleteBarbershop,
  endBarbershopTrialNow,
  getSessionAccess,
  listBarbershops,
  restartBarbershopTrial,
  setBarbershopBlocked,
} from "../../../../db/auth";

async function platformData(access: NonNullable<Awaited<ReturnType<typeof getSessionAccess>>>) {
  return {
    barbershops: await listBarbershops(access),
  };
}

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isPlatformAdmin) return Response.json({ error: "Esta área é exclusiva do administrador da plataforma." }, { status: 403 });
    return Response.json(await platformData(access));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a plataforma." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isPlatformAdmin) return Response.json({ error: "Esta área é exclusiva do administrador da plataforma." }, { status: 403 });
    const data = await request.json() as Record<string, string | number | boolean | undefined>;
    if (data.action === "set-barbershop-blocked") {
      if (typeof data.blocked !== "boolean") return Response.json({ error: "Informe se a barbearia deve ser bloqueada ou desbloqueada." }, { status: 400 });
      await setBarbershopBlocked(access, Number(data.organizationId), data.blocked);
    } else if (data.action === "end-barbershop-trial") {
      await endBarbershopTrialNow(access, Number(data.organizationId));
    } else if (data.action === "restart-barbershop-trial") {
      await restartBarbershopTrial(access, Number(data.organizationId), 14);
    } else if (data.action === "delete-barbershop") {
      await deleteBarbershop(access, Number(data.organizationId));
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, ...(await platformData(access)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a ação." }, { status: 400 });
  }
}
