import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("links transacionais usam o domínio público do Cortou Anotou em vez do host automático do Railway", async () => {
  const source = await read("lib/owner-email.ts");

  assert.match(source, /CANONICAL_APP_URL\s*=\s*"https:\/\/cortouanotou\.com\.br"/);
  assert.match(source, /endsWith\("\.up\.railway\.app"\)/);
  assert.match(source, /appUrl:\s*resolvePublicAppUrl\(values\.PUBLIC_APP_URL\)/);
  assert.match(source, /\$\{config\.appUrl\}\/confirmar-email\//);
  assert.match(source, /\$\{config\.appUrl\}\/redefinir-senha\//);
});
