import { handleWhatsappWebhook } from "../../../../db/whatsapp";

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

async function validSignature(rawBody: string, signatureHeader: string) {
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const verifyToken = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const configuredToken = configuredSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  if (mode === "subscribe" && configuredToken && constantTimeEqual(verifyToken, configuredToken)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Webhook não autorizado.", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!(await validSignature(rawBody, signature))) return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    const payload = JSON.parse(rawBody) as Parameters<typeof handleWhatsappWebhook>[0];
    const result = await handleWhatsappWebhook(payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Webhook inválido." }, { status: 400 });
  }
}
