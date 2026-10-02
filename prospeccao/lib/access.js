export const ACCESS_COOKIE = "ca_prospeccao_access";

export function accessCode() {
  return String(process.env.PROSPECCAO_ACCESS_CODE || "").trim();
}

export async function hashAccessCode(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function expectedAccessToken() {
  const code = accessCode();
  if (!code) return "";
  return hashAccessCode(code);
}
