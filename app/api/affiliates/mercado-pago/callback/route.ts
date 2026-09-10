import { completeMercadoPagoAuthorization } from "../../../../../db/mercado-pago-affiliates";

function page(title: string, message: string, ok: boolean) {
  return new Response(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="background:#f7f4ec;color:#20251f;font-family:system-ui;padding:28px"><main style="max-width:560px;margin:10vh auto;background:white;border:1px solid #e1dccf;border-radius:22px;padding:28px"><div style="font-size:44px">${ok ? "✓" : "!"}</div><h1>${title}</h1><p style="line-height:1.55">${message}</p><strong>${ok ? "Você já pode fechar esta tela." : "Peça um novo link ao administrador."}</strong></main></body></html>`, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const errorDescription = url.searchParams.get("error_description");
    if (errorDescription) return page("Conexão cancelada", "A conta Mercado Pago não foi conectada.", false);
    await completeMercadoPagoAuthorization(url.searchParams.get("code") ?? "", url.searchParams.get("state") ?? "");
    return page("Conta conectada!", "O Cortou Anotou já pode separar sua comissão automaticamente nos próximos pagamentos indicados.", true);
  } catch (error) {
    return page("Não foi possível conectar", error instanceof Error ? error.message : "A autorização não foi concluída.", false);
  }
}
