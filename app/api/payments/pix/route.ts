import { getSessionAccess } from "../../../../db/auth";
import { BillingConfigurationError, createPixPayment, getPixPayment, pixFallbackUrl } from "../../../../db/billing";

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const data = await request.json().catch(() => ({})) as { planCode?: string };
    if (data.planCode && data.planCode !== "monthly") return Response.json({ error: "Esta opção foi encerrada. Atualize o aplicativo para contratar a assinatura mensal." }, { status: 400 });
    const payment = await createPixPayment(access);
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
