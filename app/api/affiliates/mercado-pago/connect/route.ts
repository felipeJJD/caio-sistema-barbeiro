import { mercadoPagoAuthorizationUrl } from "../../../../../db/mercado-pago-affiliates";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return Response.redirect(await mercadoPagoAuthorizationUrl(token), 302);
  } catch (error) {
    return new Response(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Cortou Anotou</title><body style="font-family:system-ui;padding:32px;max-width:560px;margin:auto"><h1>Não foi possível abrir o vínculo</h1><p>${error instanceof Error ? error.message : "Peça um novo link ao Cortou Anotou."}</p></body></html>`, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
