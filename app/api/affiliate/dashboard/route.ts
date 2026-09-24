import { getAffiliateSessionAccess } from "../../../../db/affiliate-auth";
import { createAffiliateLink, deleteOwnUnusedAffiliateLink, getAffiliateDashboard, setOwnAffiliateLinkActive, setOwnReferralArchived, updateOwnAffiliatePix } from "../../../../db/affiliate-portal";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    return noStore(await getAffiliateDashboard(access, month));
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível carregar sua área." }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    const body = await request.json() as Record<string, string | number | boolean | undefined>;
    if (body.action === "create-link") {
      await createAffiliateLink(access, { label: String(body.label ?? ""), code: String(body.code ?? "") });
    } else if (body.action === "set-link-active") {
      if (typeof body.active !== "boolean") throw new Error("Informe o novo status do link.");
      await setOwnAffiliateLinkActive(access, Number(body.linkId), body.active);
    } else if (body.action === "delete-link") {
      await deleteOwnUnusedAffiliateLink(access, Number(body.linkId));
    } else if (body.action === "set-referral-archived") {
      if (typeof body.archived !== "boolean") throw new Error("Informe se a indicação deve ser arquivada.");
      await setOwnReferralArchived(access, Number(body.referralId), body.archived);
    } else if (body.action === "update-pix") {
      await updateOwnAffiliatePix(access, String(body.pixKey ?? ""));
    } else {
      return noStore({ error: "Ação inválida." }, 400);
    }
    return noStore({ ok: true, ...(await getAffiliateDashboard(access, String(body.month ?? ""))) });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, 400);
  }
}
