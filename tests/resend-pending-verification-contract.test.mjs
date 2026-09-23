import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("reenvio tenta cadastro pendente antes do fluxo antigo do proprietário", async () => {
  const source = await readFile(new URL("../app/api/auth/resend-verification/route.ts", import.meta.url), "utf8");
  assert.match(source, /resendPendingVerification/);
  assert.match(source, /if \(!resentPending\) await resendOwnerVerificationEmail/);
});
