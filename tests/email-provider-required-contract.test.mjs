import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = () => readFile(new URL("../db/verified-registration.ts", import.meta.url), "utf8");

test("funcionário e afiliado não pulam confirmação quando provedor de e-mail está indisponível", async () => {
  const text = await source();
  const checks = text.match(/ownerEmailVerificationIsConfigured\(\)/g) ?? [];
  assert.ok(checks.length >= 2);
  assert.match(text, /O envio de confirmação por e-mail ainda não está configurado/);
});
