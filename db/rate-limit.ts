type D1Value = string | number | null;

type D1Statement = {
  bind(...values: D1Value[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};

type D1DatabaseLike = {
  prepare(query: string): D1Statement;
};

export class RateLimitError extends Error {}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(input: {
  scope: string;
  identifier?: string;
  limit: number;
  windowMs: number;
  message: string;
}) {
  const identifier = input.identifier?.trim();
  if (!identifier) return;

  const { env } = await import("@/runtime/env");
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("Banco de dados indisponível.");

  const keyHash = await sha256(`${input.scope}:${identifier}`);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - input.windowMs).toISOString();

  await database.prepare(
    "DELETE FROM security_attempts WHERE scope = ? AND key_hash = ? AND created_at <= ?",
  ).bind(input.scope, keyHash, cutoff).run();

  const accepted = await database.prepare(`
    INSERT INTO security_attempts (scope, key_hash, created_at)
    SELECT ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM security_attempts
      WHERE scope = ? AND key_hash = ? AND created_at > ?
    ) < ?
    RETURNING id
  `).bind(input.scope, keyHash, now, input.scope, keyHash, cutoff, input.limit).first<{ id: number }>();

  if (!accepted) throw new RateLimitError(input.message);
}
