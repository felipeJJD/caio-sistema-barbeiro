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

test("confirmação sempre redireciona para o domínio público do Cortou Anotou", async () => {
  const source = await readFile(new URL("../app/confirmar-email/[token]/route.ts", import.meta.url), "utf8");

  assert.match(source, /CANONICAL_APP_URL\s*=\s*"https:\/\/cortouanotou\.com\.br"/);
  assert.match(source, /publicRedirect\("\/\?welcome=email-confirmed"\)/);
  assert.match(source, /publicRedirect\("\/afiliado\?welcome=email-confirmed"\)/);
  assert.doesNotMatch(source, /request\.url/);
});
