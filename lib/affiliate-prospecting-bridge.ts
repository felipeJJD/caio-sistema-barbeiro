const ACCESS_COOKIE = "ca_prospeccao_access";

type ProspectingRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  prospectorKey?: string;
  prospectorName?: string;
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serviceUrl() {
  const value = String(process.env.AFFILIATE_PROSPECTING_URL || "").trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(value)) throw new Error("A busca de prospecção ainda não foi conectada ao painel de afiliados.");
  return value;
}

async function accessCookie() {
  const code = String(process.env.AFFILIATE_PROSPECTING_ACCESS_CODE || "").trim();
  if (code.length < 8) throw new Error("A integração da prospecção ainda não foi autorizada.");
  return `${ACCESS_COOKIE}=${await sha256(code)}`;
}

export function affiliateProspectorIdentity(access: { affiliateId: number; name: string; isAdmin?: boolean }) {
  return {
    prospectorKey: `${access.isAdmin ? "admin" : "affiliate"}:${access.affiliateId}`,
    prospectorName: access.isAdmin ? "ADM" : access.name,
  };
}

export async function affiliateProspectingFetch(path: string, options: ProspectingRequestOptions = {}) {
  if (!path.startsWith("/api/")) throw new Error("Rota de prospecção inválida.");
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: await accessCookie(),
    "user-agent": "CortouAnotouAffiliatePortal/1.0",
  };
  if (options.prospectorKey) headers["x-ca-prospector-key"] = options.prospectorKey;
  if (options.prospectorName) headers["x-ca-prospector-name"] = options.prospectorName.slice(0, 140);
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const timestamp = String(Date.now());
  const serializedBody = options.body === undefined ? "" : JSON.stringify(options.body);
  const digest = await sha256(serializedBody);
  const signingKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(process.env.AFFILIATE_PROSPECTING_ACCESS_CODE || "").trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const canonical = [timestamp, options.method ?? "GET", path, options.prospectorKey ?? "", options.prospectorName?.slice(0, 140) ?? "", digest].join("\n");
  const signature = await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(canonical));
  headers["x-ca-bridge-time"] = timestamp;
  headers["x-ca-bridge-signature"] = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");

  const response = await fetch(`${serviceUrl()}${path}`, {
    method: options.method ?? "GET",
    body: serializedBody || undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(80_000),
    headers,
  });
  const payload = await response.json().catch(() => ({ error: "A busca respondeu de forma inválida." }));
  return { response, payload };
}
