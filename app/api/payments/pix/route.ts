import { getSessionAccess } from "../../../../db/auth";
import { BillingConfigurationError, createPixPayment, getPixPayment, pixFallbackUrl } from "../../../../db/billing";
import type { PixPlanCode } from "../../../../db/platform-billing";

const planCodes = new Set<PixPlanCode>(["monthly", "quarterly", "semiannual", "annual"]);

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const data = await request.json().catch(() => ({})) as { planCode?: string };
    const planCode = planCodes.has(data.planCode as PixPlanCode) ? data.planCode as PixPlanCode : "monthly";
    const payment = await createPixPayment(access, planCode);
    return Response.json({ ok: true, payment });
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return Response.json({
        error: "O Pix dentro do aplicativo ainda está sendo conectado.",
        configurationRequired: true,
        fallbackUrl: error.fallbackUrl,
      }, { status: 503 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o Pix." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const orderId = Number(new URL(request.url).searchParams.get("orderId"));
    const payment = await getPixPayment(access, orderId);
    return Response.json({ ok: true, payment });
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return Response.json({ error: "Integração Pix indisponível.", fallbackUrl: pixFallbackUrl() }, { status: 503 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o Pix." }, { status: 400 });
  }
}
