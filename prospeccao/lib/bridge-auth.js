import { accessCode, hashAccessCode } from "./access.js";

export async function authorizedBridge(request) {
  const timestamp = request.headers.get("x-ca-bridge-time") || "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300_000) return false;
  const signature = request.headers.get("x-ca-bridge-signature") || "";
  if (!/^[a-f0-9]{64}$/.test(signature) || accessCode().length < 8) return false;
  const url = new URL(request.url);
  const body = request.method === "GET" ? "" : await request.clone().text();
  const canonical = [timestamp, request.method, url.pathname + url.search, request.headers.get("x-ca-prospector-key") || "", request.headers.get("x-ca-prospector-name") || "", await hashAccessCode(body)].join("\n");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(accessCode()), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(signature.match(/../g).map(byte => parseInt(byte, 16)));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(canonical));
}
