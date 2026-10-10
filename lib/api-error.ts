import { randomUUID } from "node:crypto";

// Keep validation messages; never expose database statements, parameters or provider payloads.
export function publicErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message && message.length <= 350 && !/failed query|failed to|sqlite|SQLITE_|constraint failed|\b(?:select|insert into|update .* set|delete from)\b|params:|https?:\/\/|<[^>]+>/i.test(message)) return message;
  const reference = randomUUID().slice(0, 8).toUpperCase();
  console.error("[api:error]", { reference, kind: error instanceof Error ? error.name : "Unknown" });
  return `${fallback} Referência: ${reference}.`;
}
