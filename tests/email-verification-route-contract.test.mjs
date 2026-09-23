import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("rota de confirmação suporta proprietário, equipe e afiliado", async () => {
  const source = await readFile(new URL("../app/confirmar-email/[token]/route.ts", import.meta.url), "utf8");
  assert.match(source, /confirmPendingRegistration/);
  assert.match(source, /confirmOwnerEmail/);
  assert.match(source, /pending\?\.kind === "team"/);
  assert.match(source, /pending\?\.kind === "affiliate"/);
});
