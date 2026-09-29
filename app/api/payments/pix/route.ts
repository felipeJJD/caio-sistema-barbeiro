import { getSessionAccess } from "../../../../db/auth";
import { BillingConfigurationError, createPixPayment, getPixPayment } from "../../../../db/billing";
import type { PixPlanCode } from "../../../../db/platform-billing";

const planCodes: PixPlanCode[] = ["monthly", "quarterly", "semiannual", "annual"];

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const data = await request.json().catch(() => ({})) as { planCode?: string };
    if (data.planCode !== undefined && !planCodes.some((code) => code === data.planCode)) return Response.json({ error: "Período de assinatura inválido." }, { status: 400 });
    const payment = await createPixPayment(access, (data.planCode ?? "monthly") as PixPlanCode);
    return Response.json({ ok: true, payment });
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return Response.json({
        error: "O Pix dentro do aplicativo ainda está sendo conectado.",
        configurationRequired: true,
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
      return Response.json({ error: "Integração Pix indisponível." }, { status: 503 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o Pix." }, { status: 400 });
  }
}
