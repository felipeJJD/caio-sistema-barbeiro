import { createAffiliate, deleteAffiliate, listAffiliates, markAffiliatePayoutPaid, setAffiliateActive, updateAffiliatePix } from "../../../../db/affiliates";
import { createAffiliateInvite } from "../../../../db/affiliate-auth";
import { getSessionAccess } from "../../../../db/auth";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function publicError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || /failed query|sql|sqlite|d1_|no such table|no such column/i.test(message)) return fallback;
  return message;
}

async function data(access: NonNullable<Awaited<ReturnType<typeof getSessionAccess>>>) {
  const affiliateRows = await listAffiliates(access);
  return {
    affiliates: affiliateRows,
    summary: affiliateRows.reduce((summary, affiliate) => ({
      totalCents: summary.totalCents + Number(affiliate.earnedCents),
      pendingCents: summary.pendingCents + Number(affiliate.pendingCents),
      paidCents: summary.paidCents + Number(affiliate.paidCents),
    }), { totalCents: 0, pendingCents: 0, paidCents: 0 }),
  };
}

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    if (!access.isPlatformAdmin) return noStore({ error: "Esta área é exclusiva do administrador da plataforma." }, 403);
    return noStore(await data(access));
  } catch (error) {
    console.error("platform affiliates GET failed", error);
    return noStore({ error: publicError(error, "Não foi possível carregar os afiliados agora. Tente novamente em instantes.") }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    if (!access.isPlatformAdmin) return noStore({ error: "Esta área é exclusiva do administrador da plataforma." }, 403);
    const body = await request.json() as Record<string, string | number | boolean | undefined>;
    let inviteUrl: string | undefined;
    let inviteExpiresAt: string | undefined;
    let inviteAffiliateId: number | undefined;
    if (body.action === "create") {
      const affiliateId = await createAffiliate(access, {
        name: String(body.name ?? ""),
        email: String(body.email ?? ""),
        whatsapp: String(body.whatsapp ?? ""),
        pixKey: String(body.pixKey ?? ""),
        code: String(body.code ?? ""),
        commissionBps: Math.round(Number(body.commissionPercent) * 100),
        commissionMonths: Number(body.commissionMonths),
      });
      const invite = await createAffiliateInvite(access, affiliateId);
      inviteAffiliateId = affiliateId;
      inviteUrl = invite.inviteUrl;
      inviteExpiresAt = invite.expiresAt;
    } else if (body.action === "create-invite") {
      inviteAffiliateId = Number(body.affiliateId);
      const invite = await createAffiliateInvite(access, inviteAffiliateId);
      inviteUrl = invite.inviteUrl;
      inviteExpiresAt = invite.expiresAt;
    } else if (body.action === "set-active") {
      if (typeof body.active !== "boolean") throw new Error("Informe o novo status do afiliado.");
      await setAffiliateActive(access, Number(body.affiliateId), body.active);
    } else if (body.action === "update-pix") {
      await updateAffiliatePix(access, Number(body.affiliateId), String(body.pixKey ?? ""));
    } else if (body.action === "mark-paid") {
      await markAffiliatePayoutPaid(access, Number(body.affiliateId));
    } else if (body.action === "delete") {
      await deleteAffiliate(access, Number(body.affiliateId));
    } else {
      return noStore({ error: "Ação inválida." }, 400);
    }
    return noStore({ ok: true, ...(await data(access)), ...(inviteUrl ? { inviteUrl, inviteExpiresAt, inviteAffiliateId } : {}) });
  } catch (error) {
    console.error("platform affiliates POST failed", error);
    return noStore({ error: publicError(error, "Não foi possível salvar o afiliado agora. Tente novamente em instantes.") }, 400);
  }
}
