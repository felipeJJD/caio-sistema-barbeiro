const ACCESS_COOKIE = "ca_prospeccao_access";

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

export async function affiliateProspectingFetch(path: string) {
  if (!path.startsWith("/api/")) throw new Error("Rota de prospecção inválida.");
  const response = await fetch(`${serviceUrl()}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(80_000),
    headers: {
      accept: "application/json",
      cookie: await accessCookie(),
      "user-agent": "CortouAnotouAffiliatePortal/1.0",
    },
  });
  const payload = await response.json().catch(() => ({ error: "A busca respondeu de forma inválida." }));
  return { response, payload };
}
