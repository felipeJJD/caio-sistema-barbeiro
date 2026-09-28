import { after } from "next/server";
import { handleWhatsappWebhook } from "../../../../db/whatsapp";
import { processCaAtendeInboundSafely } from "../../../../db/ca-atende";
import { handleEvolutionWebhook, validEvolutionWebhookSecret } from "../../../../db/whatsapp-evolution";

export const dynamic = "force-dynamic";

function configuredSecret(name: string) {
  return String(process.env[name] ?? "").trim();
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function validMetaSignature(rawBody: string, signatureHeader: string) {
  const appSecret = configuredSecret("WHATSAPP_APP_SECRET");
  if (!appSecret || !signatureHeader.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return constantTimeEqual(`sha256=${hex(signature)}`, signatureHeader.toLowerCase());
}

async function dispatchInbound(result: Awaited<ReturnType<typeof handleWhatsappWebhook>>) {
  if (!result.inboundTextEvents.length) return;
  after(async () => {
    for (const event of result.inboundTextEvents) await processCaAtendeInboundSafely(event);
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const verifyToken = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const configuredToken = configuredSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  if (mode === "subscribe" && configuredToken && constantTimeEqual(verifyToken, configuredToken)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Webhook ativo.", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000) return Response.json({ error: "Webhook muito grande." }, { status: 413 });

    const evolutionSecret = request.headers.get("x-ca-evolution-secret") ?? "";
    if (evolutionSecret) {
      if (!validEvolutionWebhookSecret(evolutionSecret)) return Response.json({ error: "Webhook Evolution não autorizado." }, { status: 401 });
      const result = await handleEvolutionWebhook(JSON.parse(rawBody));
      await dispatchInbound(result);
      return Response.json({ ok: true, provider: "evolution", received: result.received, statuses: result.statuses });
    }

    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!(await validMetaSignature(rawBody, signature))) return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    const payload = JSON.parse(rawBody) as Parameters<typeof handleWhatsappWebhook>[0];
    const result = await handleWhatsappWebhook(payload);
    await dispatchInbound(result);
    return Response.json({ ok: true, provider: "meta_cloud", received: result.received, statuses: result.statuses });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Webhook inválido." }, { status: 400 });
  }
}
