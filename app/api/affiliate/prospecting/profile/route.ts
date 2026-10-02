import { eq } from "drizzle-orm";
import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { getDb } from "../../../../../db/index";
import { affiliates } from "../../../../../db/schema";

function noStore(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!digits) return "";
  if (!/^\d{10,11}$/.test(digits)) throw new Error("Informe um WhatsApp com DDD.");
  return `55${digits}`;
}

export async function POST(request: Request) {
  try {
    const access = await getAffiliateSessionAccess();
    if (!access?.active) return noStore({ error: "Sua sessão terminou. Entre novamente." }, 401);
    const body = await request.json() as { whatsapp?: string };
    const whatsapp = normalizeWhatsapp(String(body.whatsapp ?? ""));
    const db = await getDb();
    await db.update(affiliates).set({ whatsapp, updatedAt: new Date().toISOString() }).where(eq(affiliates.id, access.affiliateId));
    return noStore({ ok: true, whatsapp });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Não foi possível salvar o WhatsApp." }, 400);
  }
}
